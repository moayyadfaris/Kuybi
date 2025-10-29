import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException
} from '@nestjs/common'
import { Category } from '@modules/categories/entities/category.entity'
import { CategoryRepository } from '@core/database/repositories/category.repository'
import { CreateCategoryDto } from '@modules/categories/dto/create-category.dto'
import { UpdateCategoryDto } from '@modules/categories/dto/update-category.dto'
import { SearchCategoriesDto } from '@modules/categories/dto/search-categories.dto'

@Injectable()
export class CategoriesService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  /**
   * Create a new category
   */
  async create(createCategoryDto: CreateCategoryDto, createdBy?: string): Promise<Category> {
    // Generate slug from name if not provided
    const slug = createCategoryDto.slug || this.generateSlug(createCategoryDto.name)

    // Check if slug already exists
    const slugExists = await this.categoryRepository.slugExists(slug)
    if (slugExists) {
      throw new ConflictException(`Category with slug '${slug}' already exists`)
    }

    return this.categoryRepository.create({
      ...createCategoryDto,
      slug,
      createdBy,
      isActive: createCategoryDto.isActive ?? true,
      metadata: createCategoryDto.metadata ?? {}
    })
  }

  /**
   * Find all categories with optional search
   */
  async findAll(searchDto: SearchCategoriesDto) {
    return this.categoryRepository.search({
      search: searchDto.search,
      isActive: searchDto.isActive,
      includeDeleted: searchDto.includeDeleted,
      orderBy: searchDto.orderBy,
      orderDirection: searchDto.orderDirection,
      page: searchDto.page,
      limit: searchDto.limit
    })
  }

  /**
   * Find all active categories (cached)
   */
  async findAllActive(): Promise<Category[]> {
    return this.categoryRepository.findAllActive()
  }

  /**
   * Find category by ID
   */
  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepository.findById(id)

    if (!category || category.deletedAt) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }

    return category
  }

  /**
   * Find category by slug
   */
  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoryRepository.findBySlug(slug)

    if (!category) {
      throw new NotFoundException(`Category with slug '${slug}' not found`)
    }

    return category
  }

  /**
   * Update a category
   */
  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    updatedBy?: string
  ): Promise<Category> {
    // Check if category exists
    const existing = await this.findOne(id)

    // If slug is being updated, check for conflicts
    if (updateCategoryDto.slug && updateCategoryDto.slug !== existing.slug) {
      const slugExists = await this.categoryRepository.slugExists(updateCategoryDto.slug, id)
      if (slugExists) {
        throw new ConflictException(`Category with slug '${updateCategoryDto.slug}' already exists`)
      }
    }

    // If name is being updated but slug is not, regenerate slug
    if (updateCategoryDto.name && !updateCategoryDto.slug) {
      const newSlug = this.generateSlug(updateCategoryDto.name)
      if (newSlug !== existing.slug) {
        const slugExists = await this.categoryRepository.slugExists(newSlug, id)
        if (!slugExists) {
          updateCategoryDto.slug = newSlug
        }
      }
    }

    const updated = await this.categoryRepository.update(id, {
      ...updateCategoryDto,
      updatedBy,
      version: existing.version + 1
    })

    if (!updated) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }

    return updated
  }

  /**
   * Soft delete a category
   */
  async remove(id: string, deletedBy?: string): Promise<void> {
    const existing = await this.findOne(id)

    const deleted = await this.categoryRepository.softDelete(id, deletedBy)

    if (!deleted) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }
  }

  /**
   * Hard delete a category (permanent)
   */
  async hardDelete(id: string): Promise<void> {
    const deleted = await this.categoryRepository.delete(id)

    if (!deleted) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }
  }

  /**
   * Restore a soft-deleted category
   */
  async restore(id: string): Promise<Category> {
    const restored = await this.categoryRepository.restore(id)

    if (!restored) {
      throw new NotFoundException(`Category with ID '${id}' not found`)
    }

    return restored
  }

  /**
   * Get category statistics
   */
  async getStats() {
    return this.categoryRepository.getStats()
  }

  /**
   * Generate a slug from a name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
  }
}
