import { Injectable, NotFoundException } from '@nestjs/common'

import { CategoryRepository } from '@core/database/repositories/category.repository'

import { WebQueryDto } from '../dto/web-query.dto'

@Injectable()
export class WebCategoriesService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  /**
   * Get active categories for public consumption
   * Only returns active categories
   */
  async getActiveCategories(query: WebQueryDto) {
    const { search, page = 1, limit = 50 } = query

    const result = await this.categoryRepository.search({
      search,
      isActive: true,
      includeDeleted: false,
      includeCounts: true,
      page,
      limit,
      orderBy: 'name',
      orderDirection: 'ASC'
    })

    // Sanitize response
    return {
      data: result.results.map((category) => this.sanitizeCategory(category)),
      total: result.total,
      page: result.pagination.page,
      limit: result.pagination.limit,
      totalPages: result.pagination.totalPages
    }
  }

  /**
   * Get category tree structure for navigation
   */
  async getCategoryTree() {
    const categories = await this.categoryRepository.findAllActive()
    return categories.map((category) => this.sanitizeCategory(category))
  }

  /**
   * Get a single active category by ID
   */
  async getActiveCategoryById(id: string) {
    const category = await this.categoryRepository.findById(id)

    if (!category || !category.isActive || category.deletedAt) {
      throw new NotFoundException('Category not found')
    }

    return this.sanitizeCategory(category)
  }

  /**
   * Get a single active category by slug
   */
  async getActiveCategoryBySlug(slug: string) {
    const category = await this.categoryRepository.findBySlug(slug)

    if (!category || !category.isActive || category.deletedAt) {
      throw new NotFoundException('Category not found')
    }

    return this.sanitizeCategory(category)
  }

  /**
   * Sanitize category data for public consumption
   */
  private sanitizeCategory(category: any) {
    const {
      createdBy,
      updatedBy,
      deletedBy,
      deletedAt,
      version,
      ...publicData
    } = category

    return publicData
  }
}
