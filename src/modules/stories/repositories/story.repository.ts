import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, FindOptionsRelations, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { STORY_SORT_FIELDS, type StorySortField } from '../constants/story-sort-fields'
import { Story, StoryPriority, StoryStatus, StoryType } from '../entities/story.entity'

/**
 * Story Repository
 *
 * Handles all database operations for Story entity with caching.
 */
/**
 * Author columns loaded with stories. Story responses only need to identify the author;
 * contact details and account state stay out of story payloads (and the story cache).
 */
const STORY_AUTHOR_COLUMNS = ['user.id', 'user.name']

@Injectable()
export class StoryRepository extends BaseRepository<Story> {
  protected entityName = 'story'
  protected defaultTTL = 600 // 10 minutes for stories (more dynamic)

  constructor(
    @InjectRepository(Story)
    repository: Repository<Story>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Override findById to include tags, categories, mainImage, and user relations
   * This prevents N+1 queries when accessing these relations
   */
  async findById(
    id: string | number,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<Story | null> {
    const cacheKey = this.buildCacheKey('id', id)

    if (!options?.bypassCache && this.cacheService) {
      return this.cached<Story | null>(
        cacheKey,
        async () => {
          return this.findByIdQuery(id)
        },
        options?.ttl ?? this.defaultTTL
      )
    }

    return this.findByIdQuery(id)
  }

  private findByIdQuery(id: string | number): Promise<Story | null> {
    return this.repository
      .createQueryBuilder('story')
      .leftJoinAndSelect('story.tags', 'tags')
      .leftJoinAndSelect('story.categories', 'categories')
      .leftJoinAndSelect('story.mainImage', 'mainImage')
      .leftJoin('story.user', 'user')
      .addSelect(STORY_AUTHOR_COLUMNS)
      .where('story.id = :id', { id })
      .getOne()
  }

  /**
   * Find stories by user with caching
   * Includes mainImage and user to prevent N+1 queries
   */
  async findByUser(
    userId: string,
    options?: {
      includeDeleted?: boolean
      limit?: number
      offset?: number
    }
  ): Promise<Story[]> {
    const cacheKey = this.buildCacheKey('user', userId, JSON.stringify(options || {}))

    return this.cached<Story[]>(
      cacheKey,
      async () => {
        const query = this.repository
          .createQueryBuilder('story')
          .leftJoinAndSelect('story.tags', 'tags')
          .leftJoinAndSelect('story.categories', 'categories')
          .leftJoinAndSelect('story.mainImage', 'mainImage')
          .leftJoin('story.user', 'user')
          .addSelect(STORY_AUTHOR_COLUMNS)
          .where('story.userId = :userId', { userId })
          .orderBy('story.createdAt', 'DESC')

        if (!options?.includeDeleted) {
          query.andWhere('story.deletedAt IS NULL')
        }

        if (options?.limit) {
          query.take(options.limit)
        }

        if (options?.offset) {
          query.skip(options.offset)
        }

        return query.getMany()
      },
      this.defaultTTL
    )
  }

  /**
   * Find stories by status with caching
   * Includes mainImage and user to prevent N+1 queries
   */
  async findByStatus(
    status: StoryStatus,
    options?: {
      limit?: number
      offset?: number
    }
  ): Promise<Story[]> {
    const cacheKey = this.buildCacheKey('status', status, JSON.stringify(options || {}))

    return this.cached<Story[]>(
      cacheKey,
      async () => {
        const query = this.repository
          .createQueryBuilder('story')
          .leftJoinAndSelect('story.tags', 'tags')
          .leftJoinAndSelect('story.categories', 'categories')
          .leftJoinAndSelect('story.mainImage', 'mainImage')
          .leftJoin('story.user', 'user')
          .addSelect(STORY_AUTHOR_COLUMNS)
          .where('story.status = :status', { status })
          .andWhere('story.deletedAt IS NULL')
          .orderBy('story.createdAt', 'DESC')

        if (options?.limit) {
          query.take(options.limit)
        }

        if (options?.offset) {
          query.skip(options.offset)
        }

        return query.getMany()
      },
      this.defaultTTL
    )
  }

  /**
   * Find stories by type with caching
   * Includes mainImage and user to prevent N+1 queries
   */
  async findByType(
    type: StoryType,
    options?: {
      limit?: number
      offset?: number
    }
  ): Promise<Story[]> {
    const cacheKey = this.buildCacheKey('type', type, JSON.stringify(options || {}))

    return this.cached<Story[]>(
      cacheKey,
      async () => {
        const query = this.repository
          .createQueryBuilder('story')
          .leftJoinAndSelect('story.tags', 'tags')
          .leftJoinAndSelect('story.categories', 'categories')
          .leftJoinAndSelect('story.mainImage', 'mainImage')
          .leftJoin('story.user', 'user')
          .addSelect(STORY_AUTHOR_COLUMNS)
          .where('story.type = :type', { type })
          .andWhere('story.deletedAt IS NULL')
          .orderBy('story.createdAt', 'DESC')

        if (options?.limit) {
          query.take(options.limit)
        }

        if (options?.offset) {
          query.skip(options.offset)
        }

        return query.getMany()
      },
      this.defaultTTL
    )
  }

  /**
   * Find child stories (by parent ID)
   * Includes mainImage and user to prevent N+1 queries
   */

  async findChildren(
    parentId: number,
    options?: {
      includeDeleted?: boolean
    }
  ): Promise<Story[]> {
    const cacheKey = this.buildCacheKey(
      'children',
      parentId.toString(),
      JSON.stringify(options || {})
    )

    return this.cached<Story[]>(
      cacheKey,
      async () => {
        const query = this.repository
          .createQueryBuilder('story')
          .leftJoinAndSelect('story.tags', 'tags')
          .leftJoinAndSelect('story.categories', 'categories')
          .leftJoinAndSelect('story.mainImage', 'mainImage')
          .leftJoin('story.user', 'user')
          .addSelect(STORY_AUTHOR_COLUMNS)
          .where('story.parentId = :parentId', { parentId })
          .orderBy('story.createdAt', 'DESC')

        if (!options?.includeDeleted) {
          query.andWhere('story.deletedAt IS NULL')
        }

        return query.getMany()
      },
      this.defaultTTL
    )
  }

  /**
   * Search stories with advanced filters
   * Includes mainImage and user to prevent N+1 queries
   */
  async search(filters: {
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
    const builder = this.repository
      .createQueryBuilder('story')
      .leftJoinAndSelect('story.tags', 'tags')
      .leftJoinAndSelect('story.categories', 'categories')
      .leftJoinAndSelect('story.mainImage', 'mainImage')
      .leftJoin('story.user', 'user')
      .addSelect(STORY_AUTHOR_COLUMNS)

    // Exclude soft-deleted by default
    if (!filters.includeDeleted) {
      builder.andWhere('story.deletedAt IS NULL')
    }

    // Text search
    if (filters.search) {
      builder.andWhere(
        new Brackets(qb => {
          qb.where('story.title ILIKE :search', { search: `%${filters.search}%` }).orWhere(
            'story.details ILIKE :search',
            { search: `%${filters.search}%` }
          )
        })
      )
    }

    // Apply filters
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

    // Filter by category IDs (stories that have ANY of the specified categories)
    // EXISTS filters keep each story's full tag/category lists in the result
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

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      builder.andWhere('categories.id IN (:...categoryIds)', { categoryIds: filters.categoryIds })
    }

    // Date range filters
    if (filters.fromDate) {
      builder.andWhere('story.createdAt >= :fromDate', { fromDate: filters.fromDate })
    }

    if (filters.toDate) {
      builder.andWhere('story.createdAt <= :toDate', { toDate: filters.toDate })
    }

    // Get total count
    const total = await builder.getCount()

    // Apply pagination
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

  /**
   * Get story statistics
   */
  async getStats(): Promise<{
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
      this.buildCacheKey('stats'),
      async () => {
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const month = new Date(now.getFullYear(), now.getMonth(), 1)

        // One pass for the scalar counts (FILTER), one GROUP BY per breakdown
        const [counts, byStatus, byType, byPriority] = await Promise.all([
          this.repository
            .createQueryBuilder('story')
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
            .setParameters({ today, week, month })
            .getRawOne<Record<string, string>>(),
          this.countLiveBy<StoryStatus>('status'),
          this.countLiveBy<StoryType>('type'),
          this.countLiveBy<StoryPriority>('priority')
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
          deleted: count('deleted')
        }
      },
      300 // 5 minutes
    )
  }

  /** Live (not soft-deleted) stories per value of a column */
  private async countLiveBy<K extends string>(
    column: 'status' | 'type' | 'priority'
  ): Promise<Record<K, number>> {
    const rows = await this.repository
      .createQueryBuilder('story')
      .select(`story.${column}`, 'value')
      .addSelect('COUNT(*)', 'count')
      .where('story.deletedAt IS NULL')
      .groupBy(`story.${column}`)
      .getRawMany<{ value: K; count: string }>()
    return Object.fromEntries(rows.map(row => [row.value, Number(row.count)])) as Record<K, number>
  }

  /**
   * Clears the caches a write to these stories can affect (each story's row tag and the
   * list tag: lists, per-owner/status/type lists, stats). Call it after the transaction
   * that wrote them commits; writes through save()/update()/delete() need no call.
   */
  async invalidateAfterWrite(
    ...states: Pick<Story, 'id' | 'userId' | 'status' | 'type' | 'priority'>[]
  ): Promise<void> {
    // Row tag of each story plus the list tag, which covers every cached list and the
    // stats (per user, status, type, priority...)
    for (const state of new Set(states.map(s => s.id))) {
      await this.invalidateCacheByEntityId(state)
    }
  }

  /** Uncached read with the given relations, for read-modify-save of relation arrays */
  findWithRelations(id: number, relations: FindOptionsRelations<Story>): Promise<Story | null> {
    return this.repository.findOne({ where: { id }, relations })
  }
}
