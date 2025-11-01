import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Brackets } from 'typeorm'
import { BaseRepository } from './base.repository'
import { Category } from '@modules/categories/entities/category.entity'
import { CacheService } from '../../cache/services/cache.service'

/**
 * Category Repository
 *
 * Handles all database operations for Category entity with caching.
 */
@Injectable()
export class CategoryRepository extends BaseRepository<Category> {
  protected entityName = 'category'
  protected defaultTTL = 3600 // 1 hour for categories (rarely change)

  constructor(
    @InjectRepository(Category)
    repository: Repository<Category>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Find category by slug with caching
   */
  async findBySlug(slug: string): Promise<Category | null> {
    const cacheKey = this.buildCacheKey('slug', slug.toLowerCase())

    return this.cacheService.wrap<Category>(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { slug: slug.toLowerCase(), deletedAt: null } as any
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find all active categories with caching
   */
  async findAllActive(): Promise<Category[]> {
    const cacheKey = this.buildCacheKey('all-active')

    return this.cacheService.wrap<Category[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isActive: true, deletedAt: null } as any,
          order: { name: 'ASC' }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Search categories with filters, sorting, and pagination
   */
  async search(query: {
    search?: string
    isActive?: boolean
    includeDeleted?: boolean
    orderBy?: string
    orderDirection?: 'ASC' | 'DESC'
    page?: number
    limit?: number
  }): Promise<{
    results: Category[]
    total: number
    pagination: {
      page: number
      limit: number
      totalPages: number
    }
  }> {
    const builder = this.repository.createQueryBuilder('category')

    // Exclude soft-deleted by default
    if (!query.includeDeleted) {
      builder.andWhere('category.deletedAt IS NULL')
    }

    // Apply search
    if (query.search) {
      builder.andWhere(
        new Brackets(qb => {
          qb.where('category.name ILIKE :search', { search: `%${query.search}%` })
            .orWhere('category.slug ILIKE :search', { search: `%${query.search}%` })
            .orWhere('category.description ILIKE :search', { search: `%${query.search}%` })
        })
      )
    }

    // Apply filters
    if (query.isActive !== undefined) {
      builder.andWhere('category.isActive = :isActive', { isActive: query.isActive })
    }

    // Apply sorting
    const orderBy = query.orderBy || 'name'
    const orderDirection = query.orderDirection || 'ASC'
    builder.orderBy(`category.${orderBy}`, orderDirection)

    // Apply pagination
    const limit = query.limit ?? 50
    const page = query.page ?? 1
    const currentPage = page >= 1 ? page : 1
    const offset = (currentPage - 1) * limit
    builder.skip(offset).take(limit)

    // Execute query
    const [results, total] = await builder.getManyAndCount()

    return {
      results,
      total,
      pagination: {
        page: currentPage,
        limit,
        totalPages: Math.ceil(total / limit) || 0
      }
    }
  }

  /**
   * Check if slug exists (excluding a specific ID)
   */
  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const builder = this.repository
      .createQueryBuilder('category')
      .where('LOWER(category.slug) = LOWER(:slug)', { slug })
      .andWhere('category.deletedAt IS NULL')

    if (excludeId) {
      builder.andWhere('category.id != :excludeId', { excludeId })
    }

    const count = await builder.getCount()
    return count > 0
  }

  /**
   * Soft delete a category
   */
  async softDelete(id: string, deletedBy?: string): Promise<boolean> {
    const result = await this.repository.update(id, {
      deletedAt: new Date(),
      deletedBy,
      isActive: false
    } as any)

    // Invalidate caches
    await this.invalidateEntityCache(id)
    await this.invalidateListCaches()

    return (result.affected ?? 0) > 0
  }

  /**
   * Restore a soft-deleted category
   */
  async restore(id: string): Promise<Category | null> {
    await this.repository.update(id, {
      deletedAt: null,
      deletedBy: null,
      isActive: true
    } as any)

    // Invalidate caches
    await this.invalidateEntityCache(id)
    await this.invalidateListCaches()

    return this.findById(id, { bypassCache: true })
  }

  /**
   * Get category statistics
   */
  async getStats(): Promise<{
    total: number
    active: number
    inactive: number
    deleted: number
  }> {
    const cacheKey = this.buildCacheKey('stats')

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        const [total, active, inactive, deleted] = await Promise.all([
          this.repository.count({ where: { deletedAt: null } as any }),
          this.repository.count({ where: { isActive: true, deletedAt: null } as any }),
          this.repository.count({ where: { isActive: false, deletedAt: null } as any }),
          this.repository
            .createQueryBuilder('category')
            .where('category.deletedAt IS NOT NULL')
            .getCount()
        ])

        return { total, active, inactive, deleted }
      },
      300 // 5 minutes TTL for stats
    )
  }

  /**
   * Override to add custom cache invalidation
   */
  protected async invalidateListCaches(): Promise<void> {
    await super.invalidateListCaches()

    // Invalidate specific category caches
    await this.cacheService.delPattern(`${this.entityName}:slug:*`)
    await this.cacheService.delPattern(`${this.entityName}:all-active`)
    await this.cacheService.delPattern(`${this.entityName}:stats`)
  }
}
