import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { containsPattern } from '@shared/utils/like.util'
import {
  Brackets,
  FindOptionsRelations,
  Repository,
  SelectQueryBuilder,
  WhereExpressionBuilder
} from 'typeorm'

import type { RecordScope } from '@modules/acl'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository, cacheRowTag } from '@core/database/repositories/base.repository'

import { STORY_SORT_FIELDS, type StorySortField } from '../constants/story-sort-fields'
import { Story, StoryPriority, StoryStatus, StoryType } from '../entities/story.entity'

/**
 * Author columns loaded with stories. Story responses only need to identify the author;
 * contact details and account state stay out of story payloads (and the story cache).
 */
const STORY_AUTHOR_COLUMNS = ['user.id', 'user.name']

/** Story columns a read scope may filter on (they become SQL identifiers) */
export const STORY_SCOPE_COLUMNS = ['status', 'userId', 'type', 'priority', 'countryId'] as const

/** Every story, for internal reads that are not on behalf of a user */
export const ALL_STORIES: RecordScope = { all: true }

type ListOptions = { limit?: number; offset?: number; includeDeleted?: boolean }

/**
 * Row tags of the rows a cached story embeds (entity names of their repositories): a
 * rename, delete or change of any of them through its repository drops the story entries
 */
function embeddedRows(value: Story | Story[] | null): string[] {
  const stories = Array.isArray(value) ? value : value ? [value] : []
  return stories.flatMap(story => [
    ...(story.userId ? [cacheRowTag('user', story.userId)] : []),
    ...(story.mainImageId ? [cacheRowTag('attachment', story.mainImageId)] : []),
    ...(story.tags ?? []).map(tag => cacheRowTag('tag', tag.id)),
    ...(story.categories ?? []).map(category => cacheRowTag('category', category.id))
  ])
}

/**
 * Stories with their tags, categories, main image and author (id and name), cached per
 * the cache contract and also dropped when an embedded row changes (embeddedRows). Lists
 * take the reader's scope (StoryAccessPolicy.readScope) and are cached per scope.
 */
@Injectable()
export class StoryRepository extends BaseRepository<Story> {
  protected entityName = 'story'
  protected defaultTTL = 600

  constructor(
    @InjectRepository(Story)
    repository: Repository<Story>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /** One story with its relations, soft-deleted or not (callers decide) */
  async findById(
    id: string | number,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<Story | null> {
    const load = () => this.withRelations().where('story.id = :id', { id }).getOne()
    if (options?.bypassCache) return load()
    return this.cached(this.buildCacheKey('id', id), load, options?.ttl ?? this.defaultTTL, {
      dependsOn: embeddedRows
    })
  }

  /** A user's stories, newest first */
  findByUser(userId: string, scope: RecordScope, options: ListOptions = {}): Promise<Story[]> {
    return this.list('user', 'story.userId = :value', userId, scope, options)
  }

  /** Stories with a status, newest first (soft-deleted ones never) */
  findByStatus(
    status: StoryStatus,
    scope: RecordScope,
    options: Omit<ListOptions, 'includeDeleted'> = {}
  ): Promise<Story[]> {
    return this.list('status', 'story.status = :value', status, scope, options)
  }

  /** Stories of a type, newest first (soft-deleted ones never) */
  findByType(
    type: StoryType,
    scope: RecordScope,
    options: Omit<ListOptions, 'includeDeleted'> = {}
  ): Promise<Story[]> {
    return this.list('type', 'story.type = :value', type, scope, options)
  }

  /** Direct children of a story (threads), newest first */
  findChildren(
    parentId: number,
    scope: RecordScope,
    options: Pick<ListOptions, 'includeDeleted'> = {}
  ): Promise<Story[]> {
    return this.list('children', 'story.parentId = :value', parentId, scope, options)
  }

  /**
   * The ids of a story and of every story above it (parent, grandparent...). Uncached:
   * used to refuse a parent that would make a cycle.
   */
  async findSelfAndAncestorIds(id: number): Promise<number[]> {
    const rows: Array<{ id: number }> = await this.repository.query(
      `WITH RECURSIVE chain(id, "parentId") AS (
         SELECT id, "parentId" FROM stories WHERE id = $1
         UNION
         SELECT s.id, s."parentId" FROM stories s JOIN chain c ON s.id = c."parentId"
       )
       SELECT id FROM chain`,
      [id]
    )
    return rows.map(row => Number(row.id))
  }

  /** Filtered, sorted and paginated stories, with the total count */
  async search(filters: {
    /** Which stories the reader may see */
    scope: RecordScope
    search?: string
    status?: StoryStatus
    type?: StoryType
    userId?: string
    priority?: StoryPriority
    countryId?: number
    parentId?: number
    categoryIds?: string[]
    /** Stories that have this category (by slug); does not trim the returned categories */
    categorySlug?: string
    /** Stories that have this tag (by name); does not trim the returned tags */
    tagName?: string
    fromDate?: string
    toDate?: string
    includeDeleted?: boolean
    page?: number
    limit?: number
    sortBy?: string
    sortOrder?: 'ASC' | 'DESC'
  }): Promise<{
    results: Story[]
    total: number
    pagination: {
      page: number
      limit: number
      totalPages: number
    }
  }> {
    const builder = this.withRelations()
    this.applyScope(builder, filters.scope, filters.includeDeleted)

    if (filters.search) {
      builder.andWhere('(story.title ILIKE :search OR story.details ILIKE :search)', {
        search: containsPattern(filters.search)
      })
    }

    if (filters.status) {
      builder.andWhere('story.status = :status', { status: filters.status })
    }

    if (filters.type) {
      builder.andWhere('story.type = :type', { type: filters.type })
    }

    if (filters.userId) {
      builder.andWhere('story.userId = :userId', { userId: filters.userId })
    }

    if (filters.priority) {
      builder.andWhere('story.priority = :priority', { priority: filters.priority })
    }

    if (filters.countryId) {
      builder.andWhere('story.countryId = :countryId', { countryId: filters.countryId })
    }

    if (filters.parentId) {
      builder.andWhere('story.parentId = :parentId', { parentId: filters.parentId })
    }

    // EXISTS, not a filter on the joined rows: each story keeps all its tags and categories
    if (filters.categorySlug) {
      builder.andWhere(
        `EXISTS (SELECT 1 FROM story_categories sc
                   JOIN categories c ON c.id = sc."categoryId"
                  WHERE sc."storyId" = story.id AND c.slug = :categorySlug)`,
        { categorySlug: filters.categorySlug }
      )
    }

    if (filters.tagName) {
      builder.andWhere(
        `EXISTS (SELECT 1 FROM story_tags st
                   JOIN tags t ON t.id = st."tagId"
                  WHERE st."storyId" = story.id AND lower(t.name) = lower(:tagName))`,
        { tagName: filters.tagName }
      )
    }

    // Stories that have any of these categories
    if (filters.categoryIds?.length) {
      builder.andWhere(
        `EXISTS (SELECT 1 FROM story_categories sc
                  WHERE sc."storyId" = story.id AND sc."categoryId" IN (:...categoryIds))`,
        { categoryIds: filters.categoryIds }
      )
    }

    if (filters.fromDate) {
      builder.andWhere('story.createdAt >= :fromDate', { fromDate: filters.fromDate })
    }

    if (filters.toDate) {
      builder.andWhere('story.createdAt <= :toDate', { toDate: filters.toDate })
    }

    const total = await builder.getCount()

    const page = filters.page || 1
    const limit = filters.limit || 20
    const offset = (page - 1) * limit

    builder.skip(offset).take(limit)

    // Apply sorting. sortBy becomes an identifier in ORDER BY, so only allowlisted
    // columns get through, whoever the caller is (the DTO validates it too)
    const sortBy: StorySortField = STORY_SORT_FIELDS.includes(filters.sortBy as StorySortField)
      ? (filters.sortBy as StorySortField)
      : 'createdAt'
    const sortOrder = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC'
    builder.orderBy(`story.${sortBy}`, sortOrder)

    const results = await builder.getMany()

    return {
      results,
      total,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  /** Counts over the stories a scope allows, cached for 5 minutes per scope */
  async getStats(scope: RecordScope): Promise<{
    total: number
    byStatus: Record<StoryStatus, number>
    byType: Record<StoryType, number>
    byPriority: Record<StoryPriority, number>
    createdToday: number
    createdThisWeek: number
    createdThisMonth: number
    published: number
    drafts: number
    deleted: number
  }> {
    return this.cached(
      this.buildCacheKey('stats', this.scopeKey(scope)),
      async () => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const month = new Date(now.getFullYear(), now.getMonth(), 1)

        // One pass for the scalar counts (FILTER), one GROUP BY per breakdown
        const [counts, byStatus, byType, byPriority] = await Promise.all([
          this.scoped(this.repository.createQueryBuilder('story'), scope)
            .select('COUNT(*) FILTER (WHERE story.deletedAt IS NULL)', 'total')
            .addSelect(
              'COUNT(*) FILTER (WHERE story.deletedAt IS NULL AND story.createdAt >= :today)',
              'createdToday'
            )
            .addSelect(
              'COUNT(*) FILTER (WHERE story.deletedAt IS NULL AND story.createdAt >= :week)',
              'createdThisWeek'
            )
            .addSelect(
              'COUNT(*) FILTER (WHERE story.deletedAt IS NULL AND story.createdAt >= :month)',
              'createdThisMonth'
            )
            .addSelect('COUNT(*) FILTER (WHERE story.deletedAt IS NOT NULL)', 'deleted')
            .setParameter('today', today)
            .setParameter('week', week)
            .setParameter('month', month)
            .getRawOne<Record<string, string>>(),
          this.countLiveBy<StoryStatus>('status', scope),
          this.countLiveBy<StoryType>('type', scope),
          this.countLiveBy<StoryPriority>('priority', scope)
        ])

        const count = (key: string) => Number(counts?.[key] ?? 0)
        return {
          total: count('total'),
          byStatus,
          byType,
          byPriority,
          createdToday: count('createdToday'),
          createdThisWeek: count('createdThisWeek'),
          createdThisMonth: count('createdThisMonth'),
          published: byStatus[StoryStatus.PUBLISHED] ?? 0,
          drafts: byStatus[StoryStatus.DRAFT] ?? 0,
          // Deleted stories are listed only for unrestricted readers, so only they get a count
          deleted: scope.all ? count('deleted') : 0
        }
      },
      300 // 5 minutes
    )
  }

  /** Live (not soft-deleted) stories per value of a column */
  private async countLiveBy<K extends string>(
    column: 'status' | 'type' | 'priority',
    scope: RecordScope
  ): Promise<Record<K, number>> {
    const rows = await this.scoped(this.repository.createQueryBuilder('story'), scope)
      .select(`story.${column}`, 'value')
      .addSelect('COUNT(*)', 'count')
      .andWhere('story.deletedAt IS NULL')
      .groupBy(`story.${column}`)
      .getRawMany<{ value: K; count: string }>()
    return Object.fromEntries(rows.map(row => [row.value, Number(row.count)])) as Record<K, number>
  }

  /**
   * Limits a query to the stories a scope allows. Soft-deleted stories are left out
   * unless `includeDeleted`, which only an unrestricted scope may use.
   */
  private applyScope(
    query: SelectQueryBuilder<Story>,
    scope: RecordScope,
    includeDeleted = false
  ): void {
    this.scoped(query, scope)
    if (!(scope.all && includeDeleted)) {
      query.andWhere('story.deletedAt IS NULL')
    }
  }

  /** Adds the scope's conditions (any one of its condition sets) to the query */
  private scoped(query: SelectQueryBuilder<Story>, scope: RecordScope): SelectQueryBuilder<Story> {
    if (scope.all) return query
    if (scope.anyOf.length === 0) return query.andWhere('FALSE')

    return query.andWhere(
      new Brackets(anyOf => {
        scope.anyOf.forEach((conditions, i) => {
          anyOf.orWhere(new Brackets(allOf => this.whereAll(allOf, conditions, `scope${i}`)))
        })
      })
    )
  }

  private whereAll(
    query: WhereExpressionBuilder,
    conditions: Record<string, unknown>,
    prefix: string
  ): void {
    for (const [column, value] of Object.entries(conditions)) {
      // Column names become identifiers: only the allowlisted ones get through
      if (!(STORY_SCOPE_COLUMNS as readonly string[]).includes(column)) {
        query.andWhere('FALSE')
      } else if (value === null) {
        query.andWhere(`story.${column} IS NULL`)
      } else {
        const param = `${prefix}_${column}`
        query.andWhere(`story.${column} = :${param}`, { [param]: value })
      }
    }
  }

  /** Cache-key part for a scope: lists differ per scope, so they are cached per scope */
  private scopeKey(scope: RecordScope): string {
    return scope.all ? 'all' : JSON.stringify(scope.anyOf)
  }

  /** Uncached read with the given relations, for read-modify-save of relation arrays */
  findWithRelations(id: number, relations: FindOptionsRelations<Story>): Promise<Story | null> {
    return this.repository.findOne({ where: { id }, relations })
  }

  private withRelations(): SelectQueryBuilder<Story> {
    return this.repository
      .createQueryBuilder('story')
      .leftJoinAndSelect('story.tags', 'tags')
      .leftJoinAndSelect('story.categories', 'categories')
      .leftJoinAndSelect('story.mainImage', 'mainImage')
      .leftJoin('story.user', 'user')
      .addSelect(STORY_AUTHOR_COLUMNS)
  }

  /** A cached, scoped list of the stories matching one condition, newest first */
  private list(
    name: string,
    condition: string,
    value: string | number,
    scope: RecordScope,
    options: ListOptions
  ): Promise<Story[]> {
    const key = this.buildCacheKey(name, value, this.scopeKey(scope), JSON.stringify(options))
    const load = () => {
      const query = this.withRelations()
        .where(condition, { value })
        .orderBy('story.createdAt', 'DESC')
      this.applyScope(query, scope, options.includeDeleted)
      if (options.limit) query.take(options.limit)
      if (options.offset) query.skip(options.offset)
      return query.getMany()
    }
    return this.cached(key, load, this.defaultTTL, { dependsOn: embeddedRows })
  }
}
