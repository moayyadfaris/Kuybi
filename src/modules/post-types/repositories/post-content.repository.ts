import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { PostContent } from '../entities/post-content.entity'
import { ContentStatus } from '../enums/content-status.enum'

/**
 * PostContent Repository
 *
 * Data access layer for PostContent entities with caching (10-min TTL).
 * Handles dynamic content with JSONB field_data queries.
 *
 * Cache Strategy:
 * - 10-minute TTL (content changes frequently)
 * - Cache by ID, slug, post type + status combinations
 * - Invalidate on create/update/delete operations
 *
 * Performance:
 * - Uses GIN indexes for fast JSONB queries
 * - Full-text search on title + excerpt
 * - Optimized queries with proper indexes
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Injectable()
export class PostContentRepository extends BaseRepository<PostContent> {
  protected entityName = 'post_content'
  protected defaultTTL = 600 // 10 minutes (content changes more frequently)

  constructor(
    @InjectRepository(PostContent)
    repository: Repository<PostContent>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Find content by post type with caching
   * @param postTypeId - Post type UUID
   * @param options - Query and cache options
   */
  async findByPostType(
    postTypeId: string,
    options?: {
      status?: ContentStatus
      limit?: number
      offset?: number
      includeDeleted?: boolean
      bypassCache?: boolean
    }
  ): Promise<PostContent[]> {
    const cacheKey = this.buildCacheKey(
      'postType',
      postTypeId,
      options?.status ?? 'all',
      options?.limit ?? 'all',
      options?.offset ?? 0,
      options?.includeDeleted ? 'withDeleted' : 'active'
    )

    if (!options?.bypassCache && this.cacheService) {
      return this.cacheService.wrap<PostContent[]>(
        cacheKey,
        async () => {
          const query = this.repository
            .createQueryBuilder('pc')
            .where('pc.postTypeId = :postTypeId', { postTypeId })

          // Only filter out deleted if not explicitly included
          if (!options?.includeDeleted) {
            query.andWhere('pc.deletedAt IS NULL')
          }

          query.orderBy('pc.publishedAt', 'DESC').addOrderBy('pc.createdAt', 'DESC')

          if (options?.status) {
            query.andWhere('pc.status = :status', { status: options.status })
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

    const query = this.repository
      .createQueryBuilder('pc')
      .where('pc.postTypeId = :postTypeId', { postTypeId })

    // Only filter out deleted if not explicitly included
    if (!options?.includeDeleted) {
      query.andWhere('pc.deletedAt IS NULL')
    }

    query.orderBy('pc.publishedAt', 'DESC').addOrderBy('pc.createdAt', 'DESC')

    if (options?.status) {
      query.andWhere('pc.status = :status', { status: options.status })
    }

    if (options?.limit) {
      query.take(options.limit)
    }

    if (options?.offset) {
      query.skip(options.offset)
    }

    return query.getMany()
  }

  /**
   * Find content by slug within a post type
   * @param postTypeId - Post type UUID
   * @param slug - Content slug
   */
  async findBySlug(postTypeId: string, slug: string): Promise<PostContent | null> {
    const cacheKey = this.buildCacheKey('slug', postTypeId, slug)

    if (this.cacheService) {
      return this.cacheService.wrap<PostContent>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { postTypeId, slug, deletedAt: null as never },
            relations: ['author', 'featuredImage']
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.findOne({
      where: { postTypeId, slug, deletedAt: null as never },
      relations: ['author', 'featuredImage']
    })
  }

  /**
   * Check if content with specific field value exists
   * Used for unique field validation
   * @param postTypeId - Post type UUID
   * @param fieldName - Field name in field_data
   * @param fieldValue - Field value to check
   * @param excludeId - Optional content ID to exclude (for updates)
   */
  async existsByFieldValue(
    postTypeId: string,
    fieldName: string,
    fieldValue: unknown,
    excludeId?: string
  ): Promise<boolean> {
    const query = this.repository
      .createQueryBuilder('pc')
      .where('pc.postTypeId = :postTypeId', { postTypeId })
      .andWhere(`pc.fieldData @> :fieldData`, {
        fieldData: JSON.stringify({ [fieldName]: fieldValue })
      })
      .andWhere('pc.deletedAt IS NULL')

    if (excludeId) {
      query.andWhere('pc.id != :excludeId', { excludeId })
    }

    const count = await query.getCount()
    return count > 0
  }

  /**
   * Full-text search on title and excerpt
   * Uses PostgreSQL's full-text search with GIN index
   * @param postTypeId - Post type UUID (optional, searches all types if not provided)
   * @param searchTerm - Search term
   * @param options - Query options
   */
  async fullTextSearch(
    postTypeId: string | undefined,
    searchTerm: string,
    options?: {
      status?: ContentStatus
      limit?: number
      offset?: number
      includeDeleted?: boolean
    }
  ): Promise<PostContent[]> {
    const query = this.repository
      .createQueryBuilder('pc')
      .where(
        `to_tsvector('english', COALESCE(pc.title, '') || ' ' || COALESCE(pc.excerpt, '')) @@ plainto_tsquery('english', :searchTerm)`,
        { searchTerm }
      )

    // Only filter out deleted if not explicitly included
    if (!options?.includeDeleted) {
      query.andWhere('pc.deletedAt IS NULL')
    }

    query.orderBy(
      `ts_rank(to_tsvector('english', COALESCE(pc.title, '') || ' ' || COALESCE(pc.excerpt, '')), plainto_tsquery('english', :searchTerm))`,
      'DESC'
    )

    if (postTypeId) {
      query.andWhere('pc.postTypeId = :postTypeId', { postTypeId })
    }

    if (options?.status) {
      query.andWhere('pc.status = :status', { status: options.status })
    }

    if (options?.limit) {
      query.take(options.limit)
    }

    if (options?.offset) {
      query.skip(options.offset)
    }

    return query.getMany()
  }

  /**
   * Query content by JSONB field values
   * Uses GIN index for efficient JSONB queries
   * @param postTypeId - Post type UUID
   * @param fieldFilters - Object with field names and values { field_name: value }
   * @param options - Query options
   */
  async queryByFieldData(
    postTypeId: string,
    fieldFilters: Record<string, unknown>,
    options?: { status?: ContentStatus; limit?: number; offset?: number }
  ): Promise<PostContent[]> {
    const query = this.repository
      .createQueryBuilder('pc')
      .where('pc.postTypeId = :postTypeId', { postTypeId })
      .andWhere(`pc.fieldData @> :fieldData`, { fieldData: JSON.stringify(fieldFilters) })
      .andWhere('pc.deletedAt IS NULL')
      .orderBy('pc.publishedAt', 'DESC')

    if (options?.status) {
      query.andWhere('pc.status = :status', { status: options.status })
    }

    if (options?.limit) {
      query.take(options.limit)
    }

    if (options?.offset) {
      query.skip(options.offset)
    }

    return query.getMany()
  }

  /**
   * Find published content (convenience method)
   * @param postTypeId - Post type UUID
   * @param limit - Number of items to return
   */
  async findPublished(postTypeId: string, limit?: number): Promise<PostContent[]> {
    return this.findByPostType(postTypeId, {
      status: ContentStatus.PUBLISHED,
      limit
    })
  }

  /**
   * Find featured content
   * @param postTypeId - Post type UUID (optional)
   * @param limit - Number of items to return
   */
  async findFeatured(postTypeId?: string, limit?: number): Promise<PostContent[]> {
    const query = this.repository
      .createQueryBuilder('pc')
      .where('pc.isFeatured = :isFeatured', { isFeatured: true })
      .andWhere('pc.status = :status', { status: ContentStatus.PUBLISHED })
      .andWhere('pc.deletedAt IS NULL')
      .orderBy('pc.publishedAt', 'DESC')

    if (postTypeId) {
      query.andWhere('pc.postTypeId = :postTypeId', { postTypeId })
    }

    if (limit) {
      query.take(limit)
    }

    return query.getMany()
  }

  /**
   * Increment view count
   * @param contentId - Content UUID
   */
  async incrementViewCount(contentId: string): Promise<void> {
    await this.repository.increment({ id: contentId }, 'viewCount', 1)
    // Note: Don't invalidate cache here to avoid performance hit on every view
  }

  /**
   * Increment like count
   * @param contentId - Content UUID
   */
  async incrementLikeCount(contentId: string): Promise<void> {
    await this.repository.increment({ id: contentId }, 'likeCount', 1)
    await this.invalidateCacheForContent(contentId)
  }

  /**
   * Check if slug exists within a post type (for validation)
   * @param postTypeId - Post type UUID
   * @param slug - Slug to check
   * @param excludeId - Optional content ID to exclude (for updates)
   */
  async slugExists(postTypeId: string, slug: string, excludeId?: string): Promise<boolean> {
    const query = this.repository
      .createQueryBuilder('pc')
      .where('pc.postTypeId = :postTypeId', { postTypeId })
      .andWhere('pc.slug = :slug', { slug })
      .andWhere('pc.deletedAt IS NULL')

    if (excludeId) {
      query.andWhere('pc.id != :excludeId', { excludeId })
    }

    const count = await query.getCount()
    return count > 0
  }

  /**
   * Invalidate cache for specific content
   * @param contentId - Content UUID or PostContent entity
   */
  async invalidateCacheForContent(contentId: string | PostContent): Promise<void> {
    if (!this.cacheService) return

    const id = typeof contentId === 'string' ? contentId : contentId.id

    // For entity, also invalidate slug-based cache
    if (typeof contentId !== 'string') {
      const slugKey = this.buildCacheKey('slug', contentId.postTypeId, contentId.slug)
      await this.cacheService.del(slugKey)
    }

    await this.cacheService.del(this.buildCacheKey('id', id))
  }

  /**
   * Invalidate all caches for a post type
   * @param postTypeId - Post type UUID
   */
  async invalidateCacheForPostType(postTypeId: string): Promise<void> {
    if (!this.cacheService) return

    // Use pattern deletion to clear all caches for this post type
    const pattern = this.buildCacheKey('postType', postTypeId, '*')
    await this.cacheService.delPattern(pattern)
  }
}
