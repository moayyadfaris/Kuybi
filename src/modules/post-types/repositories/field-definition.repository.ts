import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@core/database/repositories/base.repository'
import { CacheService } from '@core/cache/services/cache.service'
import { FieldDefinition } from '../entities/field-definition.entity'
import { FieldType } from '../enums/field-type.enum'

/**
 * FieldDefinition Repository
 *
 * Data access layer for FieldDefinition entities with caching (15-min TTL).
 * Manages custom field schemas for post types.
 *
 * Cache Strategy:
 * - 15-minute TTL (field definitions change occasionally)
 * - Cache by post type ID
 * - Invalidate on create/update/delete/reorder operations
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Injectable()
export class FieldDefinitionRepository extends BaseRepository<FieldDefinition> {
  protected entityName = 'field_definition'
  protected defaultTTL = 900 // 15 minutes

  constructor(
    @InjectRepository(FieldDefinition)
    repository: Repository<FieldDefinition>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Find all field definitions for a post type with caching
   * @param postTypeId - Post type UUID
   * @param options - Cache options
   */
  async findByPostType(
    postTypeId: string,
    options?: { bypassCache?: boolean }
  ): Promise<FieldDefinition[]> {
    const cacheKey = this.buildCacheKey('postType', postTypeId)

    if (!options?.bypassCache && this.cacheService) {
      return this.cacheService.wrap<FieldDefinition[]>(
        cacheKey,
        async () => {
          return this.repository.find({
            where: { postTypeId, deletedAt: null as never },
            order: { displayOrder: 'ASC', name: 'ASC' }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.find({
      where: { postTypeId, deletedAt: null as never },
      order: { displayOrder: 'ASC', name: 'ASC' }
    })
  }

  /**
   * Find required fields for a post type
   * @param postTypeId - Post type UUID
   */
  async findRequiredFields(postTypeId: string): Promise<FieldDefinition[]> {
    const cacheKey = this.buildCacheKey('required', postTypeId)

    if (this.cacheService) {
      return this.cacheService.wrap<FieldDefinition[]>(
        cacheKey,
        async () => {
          return this.repository.find({
            where: { postTypeId, isRequired: true, deletedAt: null as never },
            order: { displayOrder: 'ASC' }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.find({
      where: { postTypeId, isRequired: true, deletedAt: null as never },
      order: { displayOrder: 'ASC' }
    })
  }

  /**
   * Find field definition by name within a post type
   * @param postTypeId - Post type UUID
   * @param fieldName - Field name
   */
  async findByName(postTypeId: string, fieldName: string): Promise<FieldDefinition | null> {
    const cacheKey = this.buildCacheKey('name', postTypeId, fieldName)

    if (this.cacheService) {
      return this.cacheService.wrap<FieldDefinition>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { postTypeId, name: fieldName, deletedAt: null as never }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.findOne({
      where: { postTypeId, name: fieldName, deletedAt: null as never }
    })
  }

  /**
   * Find fields by type
   * @param postTypeId - Post type UUID
   * @param fieldType - Field type enum value
   */
  async findByFieldType(postTypeId: string, fieldType: FieldType): Promise<FieldDefinition[]> {
    return this.repository.find({
      where: { postTypeId, fieldType, deletedAt: null as never },
      order: { displayOrder: 'ASC' }
    })
  }

  /**
   * Find searchable fields for a post type
   * Used for building search queries
   * @param postTypeId - Post type UUID
   */
  async findSearchableFields(postTypeId: string): Promise<FieldDefinition[]> {
    const cacheKey = this.buildCacheKey('searchable', postTypeId)

    if (this.cacheService) {
      return this.cacheService.wrap<FieldDefinition[]>(
        cacheKey,
        async () => {
          return this.repository.find({
            where: { postTypeId, isSearchable: true, deletedAt: null as never },
            order: { displayOrder: 'ASC' }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.find({
      where: { postTypeId, isSearchable: true, deletedAt: null as never },
      order: { displayOrder: 'ASC' }
    })
  }

  /**
   * Check if field name exists within a post type (for validation)
   * @param postTypeId - Post type UUID
   * @param fieldName - Field name to check
   * @param excludeId - Optional field ID to exclude (for updates)
   */
  async fieldNameExists(
    postTypeId: string,
    fieldName: string,
    excludeId?: string
  ): Promise<boolean> {
    const query = this.repository
      .createQueryBuilder('fd')
      .where('fd.postTypeId = :postTypeId', { postTypeId })
      .andWhere('fd.name = :fieldName', { fieldName })
      .andWhere('fd.deletedAt IS NULL')

    if (excludeId) {
      query.andWhere('fd.id != :excludeId', { excludeId })
    }

    const count = await query.getCount()
    return count > 0
  }

  /**
   * Get next display order for a post type
   * Used when adding new fields
   * @param postTypeId - Post type UUID
   */
  async getNextDisplayOrder(postTypeId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('fd')
      .select('MAX(fd.displayOrder)', 'maxOrder')
      .where('fd.postTypeId = :postTypeId', { postTypeId })
      .andWhere('fd.deletedAt IS NULL')
      .getRawOne()

    return (result?.maxOrder ?? -1) + 1
  }

  /**
   * Reorder field definitions for a post type
   * @param postTypeId - Post type UUID
   * @param fieldOrders - Array of { id, displayOrder }
   */
  async reorderFields(
    postTypeId: string,
    fieldOrders: Array<{ id: string; displayOrder: number }>
  ): Promise<void> {
    // Update in transaction for consistency
    await this.repository.manager.transaction(async (transactionalEntityManager) => {
      for (const { id, displayOrder } of fieldOrders) {
        await transactionalEntityManager.update(
          FieldDefinition,
          { id, postTypeId },
          { displayOrder }
        )
      }
    })

    // Invalidate caches after reordering
    await this.invalidateCacheForPostType(postTypeId)
  }

  /**
   * Invalidate all caches for a specific post type
   * @param postTypeId - Post type UUID
   */
  async invalidateCacheForPostType(postTypeId: string): Promise<void> {
    if (!this.cacheService) return

    const keys = [
      this.buildCacheKey('postType', postTypeId),
      this.buildCacheKey('required', postTypeId),
      this.buildCacheKey('searchable', postTypeId)
    ]

    await Promise.all(keys.map((key) => this.cacheService.del(key)))
  }

  /**
   * Invalidate cache for specific field definition
   * @param field - Field definition entity
   */
  async invalidateCache(field: FieldDefinition): Promise<void> {
    if (!this.cacheService) return

    const keys = [
      this.buildCacheKey('id', field.id),
      this.buildCacheKey('name', field.postTypeId, field.name)
    ]

    await Promise.all(keys.map((key) => this.cacheService.del(key)))
    await this.invalidateCacheForPostType(field.postTypeId)
  }
}
