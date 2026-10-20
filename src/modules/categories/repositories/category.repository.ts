import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { containsPattern } from '@shared/utils/like.util'
import { Brackets, IsNull, Not, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { Category } from '../entities/category.entity'

/** Columns search() may sort by (they become SQL identifiers) */
export const CATEGORY_SORT_FIELDS = ['name', 'slug', 'createdAt', 'updatedAt'] as const

export interface CategorySearch {
  search?: string
  isActive?: boolean
  includeDeleted?: boolean
  includeCounts?: boolean
  orderBy?: string
  orderDirection?: 'ASC' | 'DESC'
  page?: number
  limit?: number
}

/**
 * Categories, cached under the cache contract (ADR 0003). Soft-deleted rows keep their
 * slug but no longer hold it: slugs are unique among live categories only.
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

    return this.cached<Category | null>(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { slug: slug.toLowerCase(), deletedAt: IsNull() }
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

    return this.cached<Category[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isActive: true, deletedAt: IsNull() },
          order: { name: 'ASC' }
        })
      },
      this.defaultTTL
    )
  }

  /** A page of categories matching the filters, optionally with live-story counts */
  async search(query: CategorySearch): Promise<{
    results: (Category & { storyCount?: number })[]
    total: number
    pagination: { page: number; limit: number; totalPages: number }
  }> {
    const builder = this.repository.createQueryBuilder('category')
    if (!query.includeDeleted) builder.andWhere('category.deletedAt IS NULL')
    if (query.isActive !== undefined) {
      builder.andWhere('category.isActive = :isActive', { isActive: query.isActive })
    }
    if (query.search) {
      const pattern = containsPattern(query.search)
      builder.andWhere(
        new Brackets(qb => {
          qb.where('category.name ILIKE :pattern', { pattern })
            .orWhere('category.slug ILIKE :pattern', { pattern })
            .orWhere('category.description ILIKE :pattern', { pattern })
        })
      )
    }

    const orderBy = (CATEGORY_SORT_FIELDS as readonly string[]).includes(query.orderBy ?? '')
      ? query.orderBy
      : 'name'
    const limit = query.limit ?? 50
    const page = Math.max(query.page ?? 1, 1)
    const [categories, total] = await builder
      .orderBy(`category.${orderBy}`, query.orderDirection === 'DESC' ? 'DESC' : 'ASC')
      .addOrderBy('category.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount()

    const counts = query.includeCounts ? await this.storyCounts(categories) : undefined
    return {
      results: counts
        ? categories.map(category => ({ ...category, storyCount: counts.get(category.id) ?? 0 }))
        : categories,
      total,
      pagination: { page, limit, totalPages: Math.ceil(total / limit) }
    }
  }

  /** Live stories per category, for the given categories */
  private async storyCounts(categories: Category[]): Promise<Map<string, number>> {
    if (categories.length === 0) return new Map()
    const rows: Array<{ categoryId: string; count: string }> = await this.repository.query(
      `SELECT sc."categoryId", COUNT(*) AS count
         FROM story_categories sc
         JOIN stories s ON s.id = sc."storyId" AND s."deletedAt" IS NULL
        WHERE sc."categoryId" = ANY($1)
        GROUP BY sc."categoryId"`,
      [categories.map(category => category.id)]
    )
    return new Map(rows.map(row => [row.categoryId, Number(row.count)]))
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

  /** Soft delete; the active flag is kept, so a restore brings the category back as it was */
  async softDelete(id: string, deletedBy?: string): Promise<boolean> {
    const result = await this.repository.update(
      { id, deletedAt: IsNull() },
      { deletedAt: new Date(), deletedBy }
    )
    await this.invalidateEntityCache(id)
    await this.invalidateListCaches()
    return (result.affected ?? 0) > 0
  }

  /** Undoes a soft delete; null when the category is missing or not deleted */
  async restore(id: string): Promise<Category | null> {
    const result = await this.repository.update(
      { id, deletedAt: Not(IsNull()) },
      { deletedAt: null, deletedBy: null }
    )
    if (!result.affected) return null
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

    return this.cached(
      cacheKey,
      async () => {
        const [total, active, inactive, deleted] = await Promise.all([
          this.repository.count({ where: { deletedAt: IsNull() } }),
          this.repository.count({ where: { isActive: true, deletedAt: IsNull() } }),
          this.repository.count({ where: { isActive: false, deletedAt: IsNull() } }),
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
}
