import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { PostContent } from '../entities/post-content.entity'
import { ContentStatus } from '../enums/content-status.enum'

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
