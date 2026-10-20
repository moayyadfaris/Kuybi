import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { isUniqueViolation } from '@shared/utils/database-error.util'
import { slugify, uniqueSlug } from '@shared/utils/slug.util'

import { CreateCategoryDto } from '../dto/create-category.dto'
import { SearchCategoriesDto } from '../dto/search-categories.dto'
import { UpdateCategoryDto } from '../dto/update-category.dto'
import { Category } from '../entities/category.entity'
import { CategoryRepository } from '../repositories/category.repository'

/**
 * Categories: CRUD with soft delete and restore. Slugs are unique among live categories
 * and change only when one is sent (they are in public URLs); a clash answers 409.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async create(dto: CreateCategoryDto, createdBy: string): Promise<Category> {
    let slug: string
    if (dto.slug) {
      // An explicitly requested slug must be free
      slug = dto.slug
      await this.assertSlugFree(slug)
    } else {
      // Generated slugs get a numeric suffix on collision
      slug = await uniqueSlug(slugify(dto.name, { fallback: 'category' }), candidate =>
        this.categoryRepository.slugExists(candidate)
      )
    }

    return this.slugSafe(slug, () =>
      this.categoryRepository.create({
        ...dto,
        slug,
        createdBy,
        isActive: dto.isActive ?? true,
        metadata: dto.metadata ?? {}
      })
    )
  }

  findAll(searchDto: SearchCategoriesDto, options: { includeDeleted: boolean }) {
    return this.categoryRepository.search({
      search: searchDto.search,
      isActive: searchDto.isActive,
      includeDeleted: options.includeDeleted,
      includeCounts: searchDto.includeCounts,
      orderBy: searchDto.orderBy,
      orderDirection: searchDto.orderDirection,
      page: searchDto.page,
      limit: searchDto.limit
    })
  }

  findAllActive(): Promise<Category[]> {
    return this.categoryRepository.findAllActive()
  }

  /** A live category (404 when missing or deleted) */
  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepository.findById(id)
    if (!category || category.deletedAt) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }
    return category
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoryRepository.findBySlug(slug)
    if (!category) {
      throw new NotFoundException(`Category with slug '${slug}' not found`)
    }
    return category
  }

  async update(id: string, dto: UpdateCategoryDto, updatedBy: string): Promise<Category> {
    const existing = await this.findOne(id)
    const slug = dto.slug ?? existing.slug
    if (slug !== existing.slug) await this.assertSlugFree(slug, id)

    const updated = await this.slugSafe(slug, () =>
      this.categoryRepository.update(id, {
        ...dto,
        updatedBy,
        version: existing.version + 1
      })
    )
    if (!updated) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }
    return updated
  }

  /** Soft delete; stories keep their links but no longer show the category */
  async remove(id: string, deletedBy: string): Promise<void> {
    if (!(await this.categoryRepository.softDelete(id, deletedBy))) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }
  }

  /** Permanent delete; stories' links to it go with it */
  async hardDelete(id: string): Promise<void> {
    if (!(await this.categoryRepository.delete(id))) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }
  }

  /** Brings back a deleted category (404 if it is not deleted, 409 if its slug was reused) */
  async restore(id: string): Promise<Category> {
    const restored = await this.slugSafe(undefined, () => this.categoryRepository.restore(id))
    if (!restored) {
      throw new NotFoundException(`Deleted category with ID '${id}' not found`)
    }
    return restored
  }

  getStats() {
    return this.categoryRepository.getStats()
  }

  private async assertSlugFree(slug: string, excludeId?: string): Promise<void> {
    if (await this.categoryRepository.slugExists(slug, excludeId)) {
      throw new ConflictException(`Category with slug '${slug}' already exists`)
    }
  }

  /** Runs a write; a live category taking the slug meanwhile (unique index) answers 409 */
  private async slugSafe<R>(slug: string | undefined, write: () => Promise<R>): Promise<R> {
    try {
      return await write()
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      throw new ConflictException(
        slug ? `Category with slug '${slug}' already exists` : 'Another category now uses this slug'
      )
    }
  }
}
