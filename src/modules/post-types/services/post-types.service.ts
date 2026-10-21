import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { versionConflict } from '@shared/errors'
import { isUniqueViolation } from '@shared/utils/database-error.util'
import { slugify, uniqueSlug } from '@shared/utils/slug.util'

import {
  POST_TYPE_CAPABILITY_TYPE_REGEX,
  POST_TYPE_NAME_REGEX,
  POST_TYPE_REST_BASE_REGEX
} from '../constants'
import { PostType } from '../entities/post-type.entity'
import { PostContentRepository } from '../repositories/post-content.repository'
import { PostTypeRepository } from '../repositories/post-type.repository'

/**
 * Post types (Event, Product, Recipe...): names, generated slugs, configuration. System
 * types cannot be changed or deleted, and a type that still has entries cannot be deleted.
 */
@Injectable()
export class PostTypesService {
  constructor(
    private readonly postTypeRepository: PostTypeRepository,
    private readonly postContentRepository: PostContentRepository
  ) {}

  /**
   * Create a new post type
   * @param data - Post type creation data
   * @param createdBy - User ID creating the post type
   */
  async create(
    data: {
      name: string
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
    // Validate configuration
    this.validatePostTypeConfig(data)

    // Validate name doesn't exist
    const nameExists = await this.postTypeRepository.nameExists(data.name)
    if (nameExists) {
      throw new ConflictException(`Post type with name '${data.name}' already exists`)
    }

    // Slugs are always system-generated; different names that collapse to the
    // same slug (e.g. "C#" and "C++") get a numeric suffix instead of a conflict
    const slug = await uniqueSlug(slugify(data.name, { fallback: 'post-type' }), candidate =>
      this.postTypeRepository.slugExists(candidate)
    )

    try {
      return await this.postTypeRepository.save({
        ...data,
        slug,
        createdBy,
        isActive: data.isActive ?? true,
        isSystem: false, // User-created types are never system types
        settings: data.settings ?? {}
      })
    } catch (error) {
      // Another request took the name or slug since the checks above
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Post type with name '${data.name}' already exists`)
      }
      throw error
    }
  }

  /** Live post types, active ones only unless includeInactive */
  async findAll(includeInactive = false): Promise<PostType[]> {
    if (includeInactive) {
      return this.postTypeRepository.findAll()
    }
    return this.postTypeRepository.findActive()
  }

  /**
   * Drops the cached post type: read by slug it embeds its field definitions, so field
   * changes (made through FieldDefinitionsService) must clear it
   */
  async dropCached(id: string): Promise<void> {
    await this.postTypeRepository.invalidateCache(id)
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
      /** The version last read (optimistic locking) */
      version?: number
    },
    updatedBy?: string
  ): Promise<PostType> {
    const postType = await this.findOne(id)

    // Check if it's a system type (cannot be modified)
    if (postType.isSystem) {
      throw new BadRequestException('Cannot modify system post types')
    }

    // The slug is intentionally left unchanged on rename so existing content URLs keep working

    // Validate name if being changed
    if (data.name && data.name !== postType.name) {
      const nameExists = await this.postTypeRepository.nameExists(data.name, id)
      if (nameExists) {
        throw new ConflictException(`Post type with name '${data.name}' already exists`)
      }
    }

    // Validate configuration
    this.validatePostTypeConfig(data)

    const { version, ...changes } = data
    try {
      const updated = await this.postTypeRepository.updateIfVersion(
        id,
        version ?? postType.version,
        { ...changes, updatedBy }
      )
      // Changed (or deleted) since it was read
      if (!updated) throw versionConflict('post type')
      return updated
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Post type with name '${data.name}' already exists`)
      }
      throw error
    }
  }

  /**
   * Soft delete. Refused while the type has live entries: the database's RESTRICT only
   * guards a hard delete, and a soft-deleted type would strand its entries (unreachable).
   */
  async remove(id: string): Promise<void> {
    const postType = await this.findOne(id)
    if (postType.isSystem) {
      throw new BadRequestException('Cannot delete system post types')
    }
    if (await this.postContentRepository.hasContent(id)) {
      throw new ConflictException('Delete or move the entries of this post type first')
    }
    await this.postTypeRepository.softDelete(id)
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
          'Name can only contain letters (any language), numbers, spaces, hyphens, and underscores'
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
}
