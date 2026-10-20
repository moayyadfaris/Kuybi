import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { PostType } from '../entities/post-type.entity'

/**
 * Post types, cached per the cache contract (30 minutes: they rarely change). Soft-deleted
 * types are left out by TypeORM (@DeleteDateColumn); names and slugs are unique among
 * live types only.
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
      return this.cached<PostType | null>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { slug },
            relations: { fieldDefinitions: true }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.findOne({
      where: { slug },
      relations: { fieldDefinitions: true }
    })
  }

  /**
   * Find all active post types with caching
   * Excludes deleted and inactive types
   */
  async findActive(options?: { bypassCache?: boolean }): Promise<PostType[]> {
    const cacheKey = this.buildCacheKey('active')

    if (!options?.bypassCache && this.cacheService) {
      return this.cached<PostType[]>(
        cacheKey,
        async () => {
          return this.repository.find({
            where: { isActive: true, deletedAt: IsNull() },
            order: { menuPosition: 'ASC', name: 'ASC' }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.find({
      where: { isActive: true, deletedAt: IsNull() },
      order: { menuPosition: 'ASC', name: 'ASC' }
    })
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
   * Invalidate cache for specific post type (its row, by id, slug or name, and the lists)
   * @param postType - Post type entity or ID
   */
  async invalidateCache(postType: PostType | string): Promise<void> {
    await this.invalidateCacheByEntityId(typeof postType === 'string' ? postType : postType.id)
  }
}
