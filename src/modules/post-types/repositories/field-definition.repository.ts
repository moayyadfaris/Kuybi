import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { FieldDefinition } from '../entities/field-definition.entity'

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
      return this.cached<FieldDefinition[]>(
        cacheKey,
        async () => {
          return this.repository.find({
            where: { postTypeId, deletedAt: IsNull() },
            order: { displayOrder: 'ASC', name: 'ASC' }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.find({
      where: { postTypeId, deletedAt: IsNull() },
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
      return this.cached<FieldDefinition[]>(
        cacheKey,
        async () => {
          return this.repository.find({
            where: { postTypeId, isRequired: true, deletedAt: IsNull() },
            order: { displayOrder: 'ASC' }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.find({
      where: { postTypeId, isRequired: true, deletedAt: IsNull() },
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
      return this.cached<FieldDefinition | null>(
        cacheKey,
        async () => {
          return this.repository.findOne({
            where: { postTypeId, name: fieldName, deletedAt: IsNull() }
          })
        },
        this.defaultTTL
      )
    }

    return this.repository.findOne({
      where: { postTypeId, name: fieldName, deletedAt: IsNull() }
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
    await this.repository.manager.transaction(async transactionalEntityManager => {
      for (const { id, displayOrder } of fieldOrders) {
        await transactionalEntityManager.update(
          FieldDefinition,
          { id, postTypeId },
          { displayOrder }
        )
      }
    })

    // Every reordered row changed, plus the lists
    await this.invalidateCacheByTag()
  }

  /**
   * Invalidate the field lists of a post type (tagged as lists of this entity)
   * @param _postTypeId - Post type UUID
   */
  async invalidateCacheForPostType(_postTypeId: string): Promise<void> {
    await this.invalidateListCaches()
  }

  /**
   * Invalidate cache for specific field definition (its row, by id or name, and the lists)
   * @param field - Field definition entity
   */
  async invalidateCache(field: FieldDefinition): Promise<void> {
    await this.invalidateCacheByEntityId(field.id)
  }
}
