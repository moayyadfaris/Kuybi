import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'

import {
  POST_TYPE_CAPABILITY_TYPE_REGEX,
  POST_TYPE_NAME_REGEX,
  POST_TYPE_REST_BASE_REGEX,
  SLUG_REMOVE_SPECIAL_CHARS_REGEX,
  SLUG_REPLACE_SPACES_REGEX,
  SLUG_TRIM_HYPHENS_REGEX
} from '../constants'
import { PostType } from '../entities/post-type.entity'
import { PostTypeRepository } from '../repositories/post-type.repository'

/**
 * PostTypesService
 *
 * Business logic for managing post types (Event, Product, Recipe, etc.).
 * Handles CRUD operations, validation, and cache invalidation.
 *
 * Key Responsibilities:
 * - Create/Read/Update/Delete post types
 * - Validate post type configuration
 * - Generate slugs from names
 * - Prevent deletion of system post types
 * - Cache invalidation on mutations
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Injectable()
export class PostTypesService {
  constructor(private readonly postTypeRepository: PostTypeRepository) {}

  /**
   * Create a new post type
   * @param data - Post type creation data
   * @param createdBy - User ID creating the post type
   */
  async create(
    data: {
      name: string
      slug?: string
      singularLabel: string
      pluralLabel: string
      description?: string
      icon?: string
      menuIcon?: string
      menuPosition?: number
      isHierarchical?: boolean
      supportsComments?: boolean
      supportsRevisions?: boolean
      showInRest?: boolean
      restBase?: string
      capabilityType?: string
      isActive?: boolean
      settings?: Record<string, unknown>
    },
    createdBy?: string
  ): Promise<PostType> {
    // Generate slug if not provided
    const slug = data.slug || this.generateSlug(data.name)

    // Validate slug doesn't exist
    const slugExists = await this.postTypeRepository.slugExists(slug)
    if (slugExists) {
      throw new ConflictException(`Post type with slug '${slug}' already exists`)
    }

    // Validate name doesn't exist
    const nameExists = await this.postTypeRepository.nameExists(data.name)
    if (nameExists) {
      throw new ConflictException(`Post type with name '${data.name}' already exists`)
    }

    // Validate configuration
    this.validatePostTypeConfig(data)

    // Create post type
    const postType = await this.postTypeRepository.save({
      ...data,
      slug,
      createdBy,
      isActive: data.isActive ?? true,
      isSystem: false, // User-created types are never system types
      settings: data.settings ?? {}
    })

    // Invalidate caches
    await this.postTypeRepository.invalidateAllCaches()

    return postType
  }

  /**
   * Find all post types
   * @param includeInactive - Include inactive post types
   */
  async findAll(includeInactive = false): Promise<PostType[]> {
    if (includeInactive) {
      return this.postTypeRepository.findAll()
    }
    return this.postTypeRepository.findActive()
  }

  /**
   * Find post type by ID
   * @param id - Post type UUID
   */
  async findOne(id: string): Promise<PostType> {
    const postType = await this.postTypeRepository.findById(id)

    if (!postType || postType.deletedAt) {
      throw new NotFoundException(`Post type with ID '${id}' not found`)
    }

    return postType
  }

  /**
   * Find post type by slug
   * @param slug - Post type slug
   */
  async findBySlug(slug: string): Promise<PostType> {
    const postType = await this.postTypeRepository.findBySlug(slug)

    if (!postType || postType.deletedAt) {
      throw new NotFoundException(`Post type with slug '${slug}' not found`)
    }

    return postType
  }

  /**
   * Update post type
   * @param id - Post type UUID
   * @param data - Update data
   * @param updatedBy - User ID updating the post type
   */
  async update(
    id: string,
    data: {
      name?: string
      slug?: string
      singularLabel?: string
      pluralLabel?: string
      description?: string
      icon?: string
      menuIcon?: string
      menuPosition?: number
      isHierarchical?: boolean
      supportsComments?: boolean
      supportsRevisions?: boolean
      showInRest?: boolean
      restBase?: string
      capabilityType?: string
      isActive?: boolean
      settings?: Record<string, unknown>
    },
    updatedBy?: string
  ): Promise<PostType> {
    const postType = await this.findOne(id)

    // Check if it's a system type (cannot be modified)
    if (postType.isSystem) {
      throw new BadRequestException('Cannot modify system post types')
    }

    // Validate slug if being changed
    if (data.slug && data.slug !== postType.slug) {
      const slugExists = await this.postTypeRepository.slugExists(data.slug, id)
      if (slugExists) {
        throw new ConflictException(`Post type with slug '${data.slug}' already exists`)
      }
    }

    // Validate name if being changed
    if (data.name && data.name !== postType.name) {
      const nameExists = await this.postTypeRepository.nameExists(data.name, id)
      if (nameExists) {
        throw new ConflictException(`Post type with name '${data.name}' already exists`)
      }
    }

    // Validate configuration
    this.validatePostTypeConfig(data)

    // Update post type
    Object.assign(postType, {
      ...data,
      updatedBy,
      version: postType.version + 1 // Optimistic locking
    })

    const updated = await this.postTypeRepository.save(postType)

    // Invalidate caches
    await this.postTypeRepository.invalidateCache(updated)

    return updated
  }

  /**
   * Delete post type (soft delete)
   * @param id - Post type UUID
   */
  async remove(id: string): Promise<void> {
    const postType = await this.findOne(id)

    // Prevent deletion of system post types
    if (postType.isSystem) {
      throw new BadRequestException('Cannot delete system post types')
    }

    // TODO: Phase 2 - Check if post type has content before allowing deletion
    // For now, the database FK constraint with RESTRICT will prevent deletion if content exists

    // Use TypeORM's softDelete directly
    await this.postTypeRepository.getRepository().softDelete(id)
    await this.postTypeRepository.invalidateCache(postType)
  }

  /**
   * Validate post type configuration
   * @param config - Post type configuration to validate
   */
  private validatePostTypeConfig(
    config: Partial<{
      name: string
      singularLabel: string
      pluralLabel: string
      menuPosition: number
      restBase: string
      capabilityType: string
    }>
  ): void {
    // Name validation
    if (config.name) {
      if (config.name.length < 2 || config.name.length > 100) {
        throw new BadRequestException('Name must be between 2 and 100 characters')
      }
      if (!POST_TYPE_NAME_REGEX.test(config.name)) {
        throw new BadRequestException(
          'Name can only contain letters, numbers, spaces, hyphens, and underscores'
        )
      }
    }

    // Label validation
    if (config.singularLabel && config.singularLabel.length > 100) {
      throw new BadRequestException('Singular label must not exceed 100 characters')
    }
    if (config.pluralLabel && config.pluralLabel.length > 100) {
      throw new BadRequestException('Plural label must not exceed 100 characters')
    }

    // Menu position validation
    if (config.menuPosition !== undefined && config.menuPosition < 0) {
      throw new BadRequestException('Menu position must be a non-negative number')
    }

    // REST base validation
    if (config.restBase) {
      if (!POST_TYPE_REST_BASE_REGEX.test(config.restBase)) {
        throw new BadRequestException(
          'REST base can only contain lowercase letters, numbers, hyphens, and underscores'
        )
      }
    }

    // Capability type validation
    if (config.capabilityType) {
      if (!POST_TYPE_CAPABILITY_TYPE_REGEX.test(config.capabilityType)) {
        throw new BadRequestException(
          'Capability type can only contain lowercase letters, numbers, and underscores'
        )
      }
    }
  }

  /**
   * Generate slug from name
   * @param name - Name to convert to slug
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(SLUG_REMOVE_SPECIAL_CHARS_REGEX, '') // Remove special characters
      .replace(SLUG_REPLACE_SPACES_REGEX, '-') // Replace spaces, underscores with hyphens
      .replace(SLUG_TRIM_HYPHENS_REGEX, '') // Remove leading/trailing hyphens
  }
}
