import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PostContent } from '../entities/post-content.entity'
import { PostContentRepository } from '../repositories/post-content.repository'
import { PostTypesService } from './post-types.service'
import { FieldDefinitionsService } from './field-definitions.service'
import { FieldValidationService } from './field-validation.service'
import { ContentStatus } from '../enums/content-status.enum'

/**
 * ContentService
 *
 * Business logic for managing post content (actual content instances).
 * Handles CRUD operations, validation, and publishing workflows.
 *
 * Features:
 * - Complete field data validation against field definitions
 * - Dynamic field value transformation
 * - Publishing workflow (draft, published, scheduled)
 * - Full-text search support
 * - Relationship management (attachments, tags, categories)
 *
 * Part of: Phase 2 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly postContentRepository: PostContentRepository,
    private readonly postTypesService: PostTypesService,
    private readonly fieldDefinitionsService: FieldDefinitionsService,
    private readonly fieldValidationService: FieldValidationService
  ) {}

  /**
   * Create new content (placeholder for Phase 2)
   * @param postTypeId - Post type UUID
   * @param data - Content data
   * @param authorId - User ID creating the content
   */
  async create(
    postTypeId: string,
    data: {
      title: string
      slug?: string
      excerpt?: string
      fieldData: Record<string, unknown>
      status?: ContentStatus
      featuredImageId?: string
      scheduledAt?: Date
      metaTitle?: string
      metaDescription?: string
      metaKeywords?: string
    },
    authorId: string
  ): Promise<PostContent> {
    // Validate post type exists
    await this.postTypesService.findOne(postTypeId)

    // Validate field data against field definitions
    const fieldDefinitions = await this.fieldDefinitionsService.findByPostType(postTypeId)
    const validationResult = await this.fieldValidationService.validateFieldData(
      fieldDefinitions,
      data.fieldData
    )
    this.fieldValidationService.throwIfInvalid(validationResult)

    // Generate slug if not provided
    const slug = data.slug || this.generateSlug(data.title)

    // Check slug uniqueness
    const slugExists = await this.postContentRepository.slugExists(postTypeId, slug)
    if (slugExists) {
      throw new BadRequestException(`Content with slug '${slug}' already exists for this post type`)
    }

    // Create content
    const content = await this.postContentRepository.save({
      postTypeId,
      title: data.title,
      slug,
      excerpt: data.excerpt,
      fieldData: data.fieldData,
      status: data.status || ContentStatus.DRAFT,
      authorId,
      featuredImageId: data.featuredImageId,
      scheduledAt: data.scheduledAt,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      metaKeywords: data.metaKeywords,
      createdBy: authorId
    })

    // Invalidate caches
    await this.postContentRepository.invalidateCacheForPostType(postTypeId)

    return content
  }

  /**
   * Find content by post type with pagination
   * @param postTypeId - Post type UUID
   * @param options - Filter and pagination options
   */
  async findAll(
    postTypeId: string,
    options: {
      status?: string
      limit?: number
      offset?: number
      search?: string
      includeDeleted?: boolean
    }
  ): Promise<{ data: PostContent[]; total: number }> {
    const statusEnum = options.status as ContentStatus | undefined

    if (options.search) {
      const data = await this.postContentRepository.fullTextSearch(postTypeId, options.search, {
        status: statusEnum,
        limit: options.limit,
        offset: options.offset,
        includeDeleted: options.includeDeleted
      })
      // TODO: Get accurate total count for search results
      return { data, total: data.length }
    }

    const data = await this.postContentRepository.findByPostType(postTypeId, {
      status: statusEnum,
      limit: options.limit,
      offset: options.offset,
      includeDeleted: options.includeDeleted
    })

    // TODO: Phase 2 - Implement proper count query
    // For now, return data length as total (not accurate for pagination)
    return { data, total: data.length }
  }

  /**
   * Find content by post type
   * @param postTypeId - Post type UUID
   * @param status - Optional status filter
   * @param limit - Optional limit
   * @param offset - Optional offset
   */
  async findByPostType(
    postTypeId: string,
    status?: ContentStatus,
    limit?: number,
    offset?: number
  ): Promise<PostContent[]> {
    return this.postContentRepository.findByPostType(postTypeId, { status, limit, offset })
  }

  /**
   * Find content by ID
   * @param id - Content UUID
   */
  async findOne(id: string): Promise<PostContent> {
    const content = await this.postContentRepository.findById(id)

    if (!content || content.deletedAt) {
      throw new NotFoundException(`Content with ID '${id}' not found`)
    }

    return content
  }

  /**
   * Find content by slug
   * @param postTypeId - Post type UUID
   * @param slug - Content slug
   */
  async findBySlug(postTypeId: string, slug: string): Promise<PostContent> {
    const content = await this.postContentRepository.findBySlug(postTypeId, slug)

    if (!content || content.deletedAt) {
      throw new NotFoundException(`Content with slug '${slug}' not found`)
    }

    return content
  }

  /**
   * Update content (placeholder for Phase 2)
   * @param id - Content UUID
   * @param data - Update data
   * @param updatedBy - User ID updating the content
   */
  async update(
    id: string,
    data: {
      title?: string
      slug?: string
      excerpt?: string
      fieldData?: Record<string, unknown>
      status?: ContentStatus
      featuredImageId?: string
      scheduledAt?: Date
      metaTitle?: string
      metaDescription?: string
      metaKeywords?: string
    },
    updatedBy: string
  ): Promise<PostContent> {
    const content = await this.findOne(id)

    // Validate field data against field definitions if being updated
    if (data.fieldData) {
      const fieldDefinitions = await this.fieldDefinitionsService.findByPostType(content.postTypeId)

      // Merge existing field data with updates for validation
      const mergedFieldData = {
        ...content.fieldData,
        ...data.fieldData
      }

      const validationResult = await this.fieldValidationService.validateFieldData(
        fieldDefinitions,
        mergedFieldData
      )
      this.fieldValidationService.throwIfInvalid(validationResult)
    }

    // Validate slug if being changed
    if (data.slug && data.slug !== content.slug) {
      const slugExists = await this.postContentRepository.slugExists(
        content.postTypeId,
        data.slug,
        id
      )
      if (slugExists) {
        throw new BadRequestException(`Content with slug '${data.slug}' already exists`)
      }
    }

    // Update content
    Object.assign(content, {
      ...data,
      updatedBy,
      version: content.version + 1 // Optimistic locking
    })

    const updated = await this.postContentRepository.save(content)

    // Invalidate caches
    await this.postContentRepository.invalidateCacheForContent(updated)

    return updated
  }

  /**
   * Delete content (soft delete)
   * @param id - Content UUID
   */
  async remove(id: string): Promise<void> {
    const content = await this.findOne(id)

    // Set status to DELETED before soft deleting
    content.status = ContentStatus.DELETED

    // Save the status change
    await this.postContentRepository.save(content)

    // Use TypeORM's softDelete to set deletedAt timestamp
    await this.postContentRepository.getRepository().softDelete(id)
    await this.postContentRepository.invalidateCacheForContent(content)
  }

  /**
   * Publish content
   * @param id - Content UUID
   */
  async publish(id: string): Promise<PostContent> {
    const content = await this.findOne(id)

    content.status = ContentStatus.PUBLISHED
    content.publishedAt = new Date()

    const updated = await this.postContentRepository.save(content)
    await this.postContentRepository.invalidateCacheForContent(updated)

    return updated
  }

  /**
   * Schedule content for publication
   * @param id - Content UUID
   * @param scheduledFor - Scheduled publication date
   */
  async schedule(id: string, scheduledFor: Date | string): Promise<PostContent> {
    const content = await this.findOne(id)

    const scheduleDate = typeof scheduledFor === 'string' ? new Date(scheduledFor) : scheduledFor

    // Validate date is in the future
    if (scheduleDate <= new Date()) {
      throw new BadRequestException('Scheduled date must be in the future')
    }

    content.status = ContentStatus.SCHEDULED
    content.scheduledAt = scheduleDate

    const updated = await this.postContentRepository.save(content)
    await this.postContentRepository.invalidateCacheForContent(updated)

    return updated
  }

  /**
   * Increment view count
   * @param id - Content UUID
   */
  async incrementViewCount(id: string): Promise<void> {
    await this.postContentRepository.incrementViewCount(id)
  }

  /**
   * Full-text search (placeholder for Phase 2)
   * @param searchTerm - Search term
   * @param postTypeId - Optional post type filter
   * @param limit - Optional limit
   */
  async search(searchTerm: string, postTypeId?: string, limit?: number): Promise<PostContent[]> {
    return this.postContentRepository.fullTextSearch(postTypeId, searchTerm, {
      status: ContentStatus.PUBLISHED,
      limit
    })
  }

  /**
   * Validate field data against field definitions (Phase 2 implementation)
   * @param postTypeId - Post type UUID
   * @param fieldData - Field data to validate
   */
  private async validateFieldData(
    postTypeId: string,
    fieldData: Record<string, unknown>
  ): Promise<void> {
    // TODO: Phase 2 - Implement comprehensive field data validation
    // 1. Get all field definitions for post type
    // 2. Validate required fields are present
    // 3. Validate field types match
    // 4. Validate against validation rules (min/max, pattern, etc.)
    // 5. Validate unique fields
    // 6. Check conditional logic
    // 7. Transform and sanitize values

    // Placeholder for now
    const fields = await this.fieldDefinitionsService.findByPostType(postTypeId)
    const requiredFields = fields.filter(f => f.isRequired)

    for (const field of requiredFields) {
      if (!(field.name in fieldData) || fieldData[field.name] === null) {
        throw new BadRequestException(`Required field '${field.name}' is missing`)
      }
    }
  }

  /**
   * Generate slug from title
   * @param title - Title to convert to slug
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces, underscores with hyphens
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
  }
}
