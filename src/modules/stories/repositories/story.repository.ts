import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, Brackets, IsNull, Repository } from 'typeorm'

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
      return this.cacheService.wrapWithTags<Story | null>(
        cacheKey,
        ['stories', `story:${id}`],
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

    return this.cacheService.wrapWithTags<Story[]>(
      cacheKey,
      ['stories', `user:${userId}:stories`],
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

    return this.cacheService.wrapWithTags<Story[]>(
      cacheKey,
      ['stories', `story:status:${status}`],
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

    return this.cacheService.wrapWithTags<Story[]>(
      cacheKey,
      ['stories', `story:type:${type}`],
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
   * Find stories by priority with caching
   * Includes mainImage and user to prevent N+1 queries
   */
  async findByPriority(
    priority: StoryPriority,
    options?: {
      limit?: number
      offset?: number
    }
  ): Promise<Story[]> {
    const cacheKey = this.buildCacheKey('priority', priority, JSON.stringify(options || {}))

    return this.cacheService.wrapWithTags<Story[]>(
      cacheKey,
      ['stories', `story:priority:${priority}`],
      async () => {
        const query = this.repository
          .createQueryBuilder('story')
          .leftJoinAndSelect('story.tags', 'tags')
          .leftJoinAndSelect('story.categories', 'categories')
          .leftJoinAndSelect('story.mainImage', 'mainImage')
          .leftJoin('story.user', 'user')
          .addSelect(STORY_AUTHOR_COLUMNS)
          .where('story.priority = :priority', { priority })
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

    return this.cacheService.wrapWithTags<Story[]>(
      cacheKey,
      ['stories', `story:${parentId}:children`],
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
    const cacheKey = this.buildCacheKey('stats')

    return this.cacheService.wrapWithTags(
      cacheKey,
      ['stories', 'stats'],
      async () => {
        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

        const [
          total,
          byStatus,
          byType,
          byPriority,
          createdToday,
          createdThisWeek,
          createdThisMonth,
          published,
          drafts,
          deleted
        ] = await Promise.all([
          // Total stories
          this.repository.count({ where: { deletedAt: IsNull() } }),

          // By status
          this.repository
            .createQueryBuilder('story')
            .select('story.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('story.deletedAt IS NULL')
            .groupBy('story.status')
            .getRawMany()
            .then(rows =>
              rows.reduce(
                (acc, row) => {
                  acc[row.status as StoryStatus] = parseInt(row.count)
                  return acc
                },
                {} as Record<StoryStatus, number>
              )
            ),

          // By type
          this.repository
            .createQueryBuilder('story')
            .select('story.type', 'type')
            .addSelect('COUNT(*)', 'count')
            .where('story.deletedAt IS NULL')
            .groupBy('story.type')
            .getRawMany()
            .then(rows =>
              rows.reduce(
                (acc, row) => {
                  acc[row.type as StoryType] = parseInt(row.count)
                  return acc
                },
                {} as Record<StoryType, number>
              )
            ),

          // By priority
          this.repository
            .createQueryBuilder('story')
            .select('story.priority', 'priority')
            .addSelect('COUNT(*)', 'count')
            .where('story.deletedAt IS NULL')
            .groupBy('story.priority')
            .getRawMany()
            .then(rows =>
              rows.reduce(
                (acc, row) => {
                  acc[row.priority as StoryPriority] = parseInt(row.count)
                  return acc
                },
                {} as Record<StoryPriority, number>
              )
            ),

          // Created today
          this.repository.count({
            where: {
              createdAt: Between(startOfToday, now),
              deletedAt: IsNull()
            }
          }),

          // Created this week
          this.repository.count({
            where: {
              createdAt: Between(startOfWeek, now),
              deletedAt: IsNull()
            }
          }),

          // Created this month
          this.repository.count({
            where: {
              createdAt: Between(startOfMonth, now),
              deletedAt: IsNull()
            }
          }),

          // Published
          this.repository.count({
            where: {
              status: StoryStatus.PUBLISHED,
              deletedAt: IsNull()
            }
          }),

          // Drafts
          this.repository.count({
            where: {
              status: StoryStatus.DRAFT,
              deletedAt: IsNull()
            }
          }),

          // Deleted
          this.repository.count({
            where: {
              deletedAt: Between(new Date(0), now)
            }
          })
        ])

        return {
          total,
          byStatus,
          byType,
          byPriority,
          createdToday,
          createdThisWeek,
          createdThisMonth,
          published,
          drafts,
          deleted
        }
      },
      300 // 5 minutes cache for stats
    )
  }

  /**
   * Override create to invalidate caches
   */
  async create(data: Partial<Story>): Promise<Story> {
    const story = await super.create(data)

    // Invalidate relevant caches using tags
    const tagsToInvalidate = ['stories', 'stats']
    if (data.userId) tagsToInvalidate.push(`user:${data.userId}:stories`)
    if (data.status) tagsToInvalidate.push(`story:status:${data.status}`)
    if (data.type) tagsToInvalidate.push(`story:type:${data.type}`)
    if (data.priority) tagsToInvalidate.push(`story:priority:${data.priority}`)

    await this.cacheService.invalidateTags(tagsToInvalidate)

    return story
  }

  /**
   * Override update to invalidate caches
   */
  async update(id: number, data: Partial<Story>): Promise<Story | null> {
    const story = await super.update(id, data)

    // Invalidate relevant caches using tags
    const tagsToInvalidate = ['stories', 'stats', `story:${id}`]
    if (!story) {
      await this.cacheService.invalidateTags(tagsToInvalidate)
      return null
    }

    if (story.userId) tagsToInvalidate.push(`user:${story.userId}:stories`)

    // Invalidate both old and new status/type/priority
    if (story.status) tagsToInvalidate.push(`story:status:${story.status}`)
    if (data.status && data.status !== story.status)
      tagsToInvalidate.push(`story:status:${data.status}`)

    if (story.type) tagsToInvalidate.push(`story:type:${story.type}`)
    if (data.type && data.type !== story.type) tagsToInvalidate.push(`story:type:${data.type}`)

    await this.cacheService.invalidateTags(tagsToInvalidate)

    return story
  }

  /**
   * Override delete to invalidate caches
   */
  async delete(id: number): Promise<boolean> {
    const story = await this.findById(id)
    if (!story) return false

    const result = await super.delete(id)

    // Invalidate relevant caches using tags
    const tagsToInvalidate = ['stories', 'stats', `story:${id}`]
    if (story.userId) tagsToInvalidate.push(`user:${story.userId}:stories`)
    if (story.status) tagsToInvalidate.push(`story:status:${story.status}`)
    if (story.type) tagsToInvalidate.push(`story:type:${story.type}`)

    await this.cacheService.invalidateTags(tagsToInvalidate)

    return result
  }

  /**
   * Clears every cache a write to this story can affect: the story, list/stats caches and
   * the owner/status/type/priority lists of each given state (pass the state before and
   * after an update). Call it after the transaction that wrote the story commits.
   */
  async invalidateAfterWrite(
    ...states: Pick<Story, 'id' | 'userId' | 'status' | 'type' | 'priority'>[]
  ): Promise<void> {
    const tags = new Set(['stories', 'stats'])
    for (const state of states) {
      tags.add(`story:${state.id}`)
      if (state.userId) tags.add(`user:${state.userId}:stories`)
      if (state.status) tags.add(`story:status:${state.status}`)
      if (state.type) tags.add(`story:type:${state.type}`)
      if (state.priority) tags.add(`story:priority:${state.priority}`)
      await this.invalidateCacheByEntityId(state.id)
    }
    await this.invalidateCacheByTag()
    await this.cacheService.invalidateTags([...tags])
  }

  /**
   * Manually invalidate cache for a story
   * Used by other services that modify story relationships directy
   */
  async invalidateStoryCache(id: number, userId?: string): Promise<void> {
    const tagsToInvalidate = ['stories', `story:${id}`]
    if (userId) {
      tagsToInvalidate.push(`user:${userId}:stories`)
    }
    await this.cacheService.invalidateTags(tagsToInvalidate)
  }
}
