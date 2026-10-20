import { Injectable, NotFoundException } from '@nestjs/common'

import { CategoryRepository } from '@modules/categories'

import { WebQueryDto } from '../dto/web-query.dto'
import { toPublicCategory } from '../web.presenter'

/** Active, live categories for the public site */
@Injectable()
export class WebCategoriesService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async getActiveCategories(query: WebQueryDto) {
    const result = await this.categoryRepository.search({
      search: query.search,
      isActive: true,
      page: query.page,
      limit: query.limit,
      orderBy: 'name',
      orderDirection: 'ASC'
    })
    return {
      data: result.results.map(toPublicCategory),
      total: result.total,
      page: result.pagination.page,
      limit: result.pagination.limit,
      totalPages: result.pagination.totalPages
    }
  }

  /** Every active category by name, for navigation (categories are flat) */
  async getAllActive() {
    return (await this.categoryRepository.findAllActive()).map(toPublicCategory)
  }

  async getActiveCategoryById(id: string) {
    return toPublicCategory(this.visible(await this.categoryRepository.findById(id)))
  }

  async getActiveCategoryBySlug(slug: string) {
    return toPublicCategory(this.visible(await this.categoryRepository.findBySlug(slug)))
  }

  private visible<C extends { isActive: boolean; deletedAt?: Date | null }>(category: C | null) {
    if (!category || !category.isActive || category.deletedAt) {
      throw new NotFoundException('Category not found')
    }
    return category
  }
}
