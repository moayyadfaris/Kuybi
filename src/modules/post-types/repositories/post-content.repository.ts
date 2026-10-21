import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, DeepPartial, Repository } from 'typeorm'

import type { RecordScope } from '@modules/acl'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { PostContent } from '../entities/post-content.entity'
import { ContentStatus } from '../enums/content-status.enum'

/** First key of the advisory lock serializing writes of unique field values (per post type) */
const UNIQUE_VALUES_LOCK = 0x50_43 // "PC"

/** Values that do not take part in uniqueness (an empty field is not a duplicate) */
const isEmpty = (value: unknown) => value === null || value === undefined || value === ''

/** Columns of the author shown with an entry: who wrote it, not how to reach them */
const AUTHOR_COLUMNS = ['author.id', 'author.name']

/**
 * Entries of post types, cached per the cache contract. Writes through save() clear the
 * row and the lists; bulk updates here invalidate explicitly.
 */
@Injectable()
export class PostContentRepository extends BaseRepository<PostContent> {
  protected entityName = 'post_content'
  protected defaultTTL = 600

  constructor(
    @InjectRepository(PostContent)
    repository: Repository<PostContent>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Entries of a post type, newest first (or by search rank), with the total matching
   * count. Soft-deleted entries only with includeDeleted.
   */
  list(
    postTypeId: string,
    options: {
      status?: ContentStatus
      limit: number
      offset: number
      search?: string
      includeDeleted?: boolean
      /** Entries visible besides the published ones (the viewer's edit scope) */
      editable: RecordScope
    }
  ): Promise<[PostContent[], number]> {
    const key = this.buildCacheKey('list', postTypeId, JSON.stringify(options))
    return this.cached(key, () => {
      const query = this.repository
        .createQueryBuilder('pc')
        .leftJoin('pc.author', 'author')
        .addSelect(AUTHOR_COLUMNS)
        .where('pc.postTypeId = :postTypeId', { postTypeId })
      if (options.includeDeleted) query.withDeleted()
      const { editable } = options
      if (!editable.all) {
        query.andWhere(
          new Brackets(visible => {
            visible.where('pc.status = :published', { published: ContentStatus.PUBLISHED })
            editable.anyOf.forEach((conditions, i) =>
              visible.orWhere(
                new Brackets(allOf => {
                  for (const [column, value] of Object.entries(conditions)) {
                    const param = `scope${i}_${column}`
                    // column comes from CONTENT_SCOPE_COLUMNS (recordScope filters to them)
                    allOf.andWhere(
                      value === null ? `pc.${column} IS NULL` : `pc.${column} = :${param}`,
                      { [param]: value }
                    )
                  }
                })
              )
            )
          })
        )
      }
      if (options.status) query.andWhere('pc.status = :status', { status: options.status })
      if (options.search) {
        const document = `to_tsvector('english', COALESCE(pc.title, '') || ' ' || COALESCE(pc.excerpt, ''))`
        query
          .andWhere(`${document} @@ plainto_tsquery('english', :search)`, {
            search: options.search
          })
          .orderBy(`ts_rank(${document}, plainto_tsquery('english', :search))`, 'DESC')
      } else {
        query.orderBy('pc.publishedAt', 'DESC', 'NULLS LAST').addOrderBy('pc.createdAt', 'DESC')
      }
      // offset/limit, not skip/take: the author join is many-to-one (no duplicate rows), and
      // skip/take would wrap the query in a subquery that cannot order by the search rank
      return query.offset(options.offset).limit(options.limit).getManyAndCount()
    })
  }

  /** A live entry by slug within a post type, with its author (id and name) */
  findBySlug(postTypeId: string, slug: string): Promise<PostContent | null> {
    return this.cached(this.buildCacheKey('slug', postTypeId, slug), () =>
      this.repository
        .createQueryBuilder('pc')
        .leftJoin('pc.author', 'author')
        .addSelect(AUTHOR_COLUMNS)
        .where('pc.postTypeId = :postTypeId AND pc.slug = :slug', { postTypeId, slug })
        .getOne()
    )
  }

  /**
   * Saves the entry unless another live entry of its post type has the same value in one
   * of `uniqueFields`; returns the fields in conflict instead. The check and the save run
   * in one transaction holding the post type's lock, so concurrent writers cannot both
   * take a value.
   */
  async saveUnlessDuplicate(
    entry: DeepPartial<PostContent> & { postTypeId: string },
    uniqueFields: string[]
  ): Promise<{ saved?: PostContent; conflicts: string[] }> {
    const fieldData = (entry.fieldData ?? {}) as Record<string, unknown>
    const checked = uniqueFields.filter(name => !isEmpty(fieldData[name]))
    return this.transaction(
      async manager => {
        if (checked.length > 0) {
          await manager.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [
            UNIQUE_VALUES_LOCK,
            entry.postTypeId
          ])
        }
        const conflicts: string[] = []
        for (const name of checked) {
          const [taken] = await manager.query(
            `SELECT 1 FROM post_content
              WHERE "postTypeId" = $1 AND "deletedAt" IS NULL
                AND "fieldData" -> $2 = $3::jsonb
                AND ($4::uuid IS NULL OR id <> $4)
              LIMIT 1`,
            [entry.postTypeId, name, JSON.stringify(fieldData[name]), entry.id ?? null]
          )
          if (taken) conflicts.push(name)
        }
        if (conflicts.length > 0) return { conflicts }
        return { saved: await manager.save(PostContent, entry), conflicts }
      },
      { touched: entry.id ? [entry.id] : [] }
    )
  }

  /** Whether two live entries of the post type share a (non-empty) value of this field */
  async hasDuplicateValues(postTypeId: string, fieldName: string): Promise<boolean> {
    const [duplicate] = await this.repository.query(
      `SELECT 1 FROM post_content
        WHERE "postTypeId" = $1 AND "deletedAt" IS NULL
          AND "fieldData" -> $2 IS NOT NULL
          AND "fieldData" -> $2 NOT IN ('null'::jsonb, '""'::jsonb)
        GROUP BY "fieldData" -> $2
       HAVING COUNT(*) > 1
        LIMIT 1`,
      [postTypeId, fieldName]
    )
    return !!duplicate
  }

  /** Whether a live entry of the post type has this slug */
  async slugExists(postTypeId: string, slug: string): Promise<boolean> {
    return this.repository.exists({ where: { postTypeId, slug } })
  }

  /** Whether the post type has live entries */
  hasContent(postTypeId: string): Promise<boolean> {
    return this.repository.exists({ where: { postTypeId } })
  }

  /** Soft delete with the DELETED status */
  async markDeleted(id: string): Promise<void> {
    await this.repository.update(id, { status: ContentStatus.DELETED, deletedAt: new Date() })
    await this.invalidateCacheByEntityId(id)
  }

  /** Scheduled live entries due at `now` become published; returns how many */
  async publishScheduledBefore(now: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(PostContent)
      .set({ status: ContentStatus.PUBLISHED, publishedAt: () => '"scheduledAt"' })
      .where('status = :scheduled AND "scheduledAt" <= :now AND "deletedAt" IS NULL', {
        scheduled: ContentStatus.SCHEDULED,
        now
      })
      .execute()
    const published = result.affected ?? 0
    if (published > 0) await this.invalidateCacheByTag()
    return published
  }
}
