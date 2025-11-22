import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { PostType } from '../entities/post-type.entity'

/**
 * PostType Repository
 *
 * Data access layer for PostType entities with caching (30-min TTL).
 * Extends BaseRepository for common CRUD operations with Redis caching.
 *
 * Cache Strategy:
 * - 30-minute TTL (post types rarely change)
 * - Invalidate on create/update/delete operations
 * - Cache by ID, slug, name, and active status
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Injectable()
export class PostTypeRepository extends BaseRepository<PostType> {
  protected entityName = 'post_type'
  protected defaultTTL = 1800 // 30 minutes (post types rarely change)

  constructor(
    @InjectRepository(PostType)
    repository: Repository<PostType>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Find post type by slug with caching
   * @param slug - Post type slug (e.g., "event", "product")
   * @param options - Cache options
   */
  async findBySlug(slug: string, options?: { bypassCache?: boolean }): Promise<PostType | null> {
    const cacheKey = this.buildCacheKey('slug', slug)

    if (!options?.bypassCache && this.cacheService) {
      return this.cacheService.wrap<PostType>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { slug },
            relations: ['fieldDefinitions']
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.findOne({
      where: { slug },
      relations: ['fieldDefinitions']
    })
  }

  /**
   * Find all active post types with caching
   * Excludes deleted and inactive types
   */
  async findActive(options?: { bypassCache?: boolean }): Promise<PostType[]> {
    const cacheKey = this.buildCacheKey('active')

    if (!options?.bypassCache && this.cacheService) {
      return this.cacheService.wrap<PostType[]>(
        cacheKey,
        async () => {
          return this.repository.find({
            where: { isActive: true, deletedAt: null as any },
            order: { menuPosition: 'ASC', name: 'ASC' }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.find({
      where: { isActive: true, deletedAt: null as any },
      order: { menuPosition: 'ASC', name: 'ASC' }
    })
  }

  /**
   * Find system post types (protected from deletion)
   * System types are built-in and cannot be deleted
   */
  async findSystem(options?: { bypassCache?: boolean }): Promise<PostType[]> {
    const cacheKey = this.buildCacheKey('system')

    if (!options?.bypassCache && this.cacheService) {
      return this.cacheService.wrap<PostType[]>(
        cacheKey,
        async () => {
          return this.repository.find({
            where: { isSystem: true, deletedAt: null as any }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.find({
      where: { isSystem: true, deletedAt: null as any }
    })
  }

  /**
   * Find post type by name with caching
   * @param name - Post type name (e.g., "Event", "Product")
   */
  async findByName(name: string, options?: { bypassCache?: boolean }): Promise<PostType | null> {
    const cacheKey = this.buildCacheKey('name', name)

    if (!options?.bypassCache && this.cacheService) {
      return this.cacheService.wrap<PostType>(
        cacheKey,
        async () => {
          return this.repository.findOne({ where: { name } })
        },
        this.defaultTTL
      )
    }

    return this.repository.findOne({ where: { name } })
  }

  /**
   * Check if slug exists (for validation)
   * @param slug - Slug to check
   * @param excludeId - Optional ID to exclude (for updates)
   */
  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const query = this.repository
      .createQueryBuilder('pt')
      .where('pt.slug = :slug', { slug })
      .andWhere('pt.deletedAt IS NULL')

    if (excludeId) {
      query.andWhere('pt.id != :excludeId', { excludeId })
    }

    const count = await query.getCount()
    return count > 0
  }

  /**
   * Check if name exists (for validation)
   * @param name - Name to check
   * @param excludeId - Optional ID to exclude (for updates)
   */
  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    const query = this.repository
      .createQueryBuilder('pt')
      .where('pt.name = :name', { name })
      .andWhere('pt.deletedAt IS NULL')

    if (excludeId) {
      query.andWhere('pt.id != :excludeId', { excludeId })
    }

    const count = await query.getCount()
    return count > 0
  }

  /**
   * Invalidate all caches for post types
   * Call this after create/update/delete operations
   */
  async invalidateAllCaches(): Promise<void> {
    if (!this.cacheService) return

    const keys = [
      this.buildCacheKey('active'),
      this.buildCacheKey('system'),
      this.buildCacheKey('all')
    ]

    await Promise.all(keys.map(key => this.cacheService.del(key)))
  }

  /**
   * Invalidate cache for specific post type
   * @param postType - Post type entity or ID
   */
  async invalidateCache(postType: PostType | string): Promise<void> {
    if (!this.cacheService) return

    const id = typeof postType === 'string' ? postType : postType.id
    const slug = typeof postType === 'string' ? null : postType.slug
    const name = typeof postType === 'string' ? null : postType.name

    const keys = [this.buildCacheKey('id', id)]

    if (slug) keys.push(this.buildCacheKey('slug', slug))
    if (name) keys.push(this.buildCacheKey('name', name))

    await Promise.all(keys.map(key => this.cacheService.del(key)))
    await this.invalidateAllCaches()
  }
}
