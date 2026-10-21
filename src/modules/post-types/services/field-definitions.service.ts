import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { versionConflict } from '@shared/errors'
import { isUniqueViolation } from '@shared/utils/database-error.util'

import { FieldDefinition } from '../entities/field-definition.entity'
import { FieldType } from '../enums/field-type.enum'
import { FieldDefinitionRepository } from '../repositories/field-definition.repository'
import { PostContentRepository } from '../repositories/post-content.repository'

import { PostTypesService } from './post-types.service'

/**
 * The custom fields of a post type: snake_case names unique per type (among live fields),
 * type-specific configuration checks, ordering. Changes also drop the cached post type,
 * which embeds its fields. Removing a field leaves entries' stored values in place; they
 * are dropped the next time the entry's field_data is updated.
 */
@Injectable()
export class FieldDefinitionsService {
  constructor(
    private readonly fieldDefinitionRepository: FieldDefinitionRepository,
    private readonly postContentRepository: PostContentRepository,
    private readonly postTypesService: PostTypesService
  ) {}

  /**
   * Create a new field definition
   * @param postTypeId - Post type UUID
   * @param data - Field definition data
   * @param createdBy - User ID creating the field
   */
  async create(
    postTypeId: string,
    data: {
      name: string
      label: string
      fieldType: FieldType
      description?: string
      defaultValue?: string
      placeholder?: string
      isRequired?: boolean
      isUnique?: boolean
      isSearchable?: boolean
      isFilterable?: boolean
      isSortable?: boolean
      displayOrder?: number
      fieldGroup?: string
      helpText?: string
      validationRules?: Record<string, unknown>
      fieldOptions?: Record<string, unknown>
      conditionalLogic?: Record<string, unknown>
      metadata?: Record<string, unknown>
    },
    createdBy?: string
  ): Promise<FieldDefinition> {
    // Validate post type exists
    await this.postTypesService.findOne(postTypeId)

    // Validate field name format
    this.validateFieldName(data.name)

    // Check if field name already exists for this post type
    const nameExists = await this.fieldDefinitionRepository.fieldNameExists(postTypeId, data.name)
    if (nameExists) {
      throw new ConflictException(
        `Field with name '${data.name}' already exists for this post type`
      )
    }

    this.validateFieldDefinition(data)
    // Entries may still hold values under this name (from a deleted field of the same name)
    if (data.isUnique) await this.assertNoDuplicates(postTypeId, data.name)

    // Get next display order if not provided
    const displayOrder =
      data.displayOrder ?? (await this.fieldDefinitionRepository.getNextDisplayOrder(postTypeId))

    let fieldDefinition: FieldDefinition
    try {
      fieldDefinition = await this.fieldDefinitionRepository.save({
        ...data,
        postTypeId,
        createdBy,
        displayOrder,
        isRequired: data.isRequired ?? false,
        isUnique: data.isUnique ?? false,
        isSearchable: data.isSearchable ?? true,
        isFilterable: data.isFilterable ?? true,
        isSortable: data.isSortable ?? true,
        validationRules: data.validationRules ?? {},
        fieldOptions: data.fieldOptions ?? {},
        metadata: data.metadata ?? {}
      })
    } catch (error) {
      // Another request took the name since the check above
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Field with name '${data.name}' already exists for this post type`
        )
      }
      throw error
    }

    await this.postTypesService.dropCached(postTypeId)

    return fieldDefinition
  }

  /**
   * Find all field definitions for a post type
   * @param postTypeId - Post type UUID
   */
  async findByPostType(postTypeId: string): Promise<FieldDefinition[]> {
    return this.fieldDefinitionRepository.findByPostType(postTypeId)
  }

  /**
   * Find field definition by ID
   * @param id - Field definition UUID
   */
  async findOne(id: string): Promise<FieldDefinition> {
    const field = await this.fieldDefinitionRepository.findById(id)

    if (!field || field.deletedAt) {
      throw new NotFoundException(`Field definition with ID '${id}' not found`)
    }

    return field
  }

  /**
   * Update field definition
   * @param id - Field definition UUID
   * @param data - Update data
   * @param updatedBy - User ID updating the field
   */
  async update(
    id: string,
    data: {
      label?: string
      description?: string
      defaultValue?: string
      placeholder?: string
      isRequired?: boolean
      isUnique?: boolean
      isSearchable?: boolean
      isFilterable?: boolean
      isSortable?: boolean
      displayOrder?: number
      fieldGroup?: string
      helpText?: string
      validationRules?: Record<string, unknown>
      fieldOptions?: Record<string, unknown>
      conditionalLogic?: Record<string, unknown>
      metadata?: Record<string, unknown>
      /** The version last read (optimistic locking) */
      version?: number
    },
    updatedBy?: string
  ): Promise<FieldDefinition> {
    const field = await this.findOne(id)

    this.validateFieldDefinition({ ...field, ...data })
    if (data.isUnique && !field.isUnique)
      await this.assertNoDuplicates(field.postTypeId, field.name)

    const { version, ...changes } = data
    const updated = await this.fieldDefinitionRepository.updateIfVersion(
      id,
      version ?? field.version,
      { ...changes, updatedBy }
    )
    // Changed (or deleted) since it was read
    if (!updated) throw versionConflict('field')

    // Invalidate caches
    await this.fieldDefinitionRepository.invalidateCache(updated)
    await this.postTypesService.dropCached(updated.postTypeId)

    return updated
  }

  /**
   * Soft delete a field definition
   * @param id - Field definition ID
   * @throws NotFoundException - If field definition not found
   */
  async remove(id: string): Promise<void> {
    const fieldDefinition = await this.fieldDefinitionRepository.findById(id)
    if (!fieldDefinition) {
      throw new NotFoundException(`Field definition with ID ${id} not found`)
    }
    await this.fieldDefinitionRepository.softDelete(id)

    // Invalidate the per-id/per-name caches as well as the post type lists,
    // otherwise findOne keeps serving the deleted field from cache
    await this.fieldDefinitionRepository.invalidateCache(fieldDefinition)
    await this.postTypesService.dropCached(fieldDefinition.postTypeId)
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
    // Validate all fields belong to this post type
    const fields = await this.fieldDefinitionRepository.findByPostType(postTypeId)
    const fieldIds = fields.map(f => f.id)

    for (const { id } of fieldOrders) {
      if (!fieldIds.includes(id)) {
        throw new BadRequestException(`Field with ID '${id}' does not belong to this post type`)
      }
    }

    // Validate display orders are unique and sequential
    const orders = fieldOrders.map(f => f.displayOrder)
    const uniqueOrders = new Set(orders)
    if (uniqueOrders.size !== orders.length) {
      throw new BadRequestException('Display orders must be unique')
    }

    // Reorder fields
    await this.fieldDefinitionRepository.reorderFields(postTypeId, fieldOrders)
    await this.postTypesService.dropCached(postTypeId)
  }

  /** A field can be made unique only while no two live entries share a value of it */
  private async assertNoDuplicates(postTypeId: string, name: string): Promise<void> {
    if (await this.postContentRepository.hasDuplicateValues(postTypeId, name)) {
      throw new ConflictException(
        `Entries already share values of '${name}'; make them distinct before making it unique`
      )
    }
  }

  /**
   * Validate field name format
   * @param name - Field name to validate
   */
  private validateFieldName(name: string): void {
    if (name.length < 2 || name.length > 100) {
      throw new BadRequestException('Field name must be between 2 and 100 characters')
    }

    // Field names should be snake_case (for JSONB storage)
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new BadRequestException(
        'Field name must start with a lowercase letter and contain only lowercase letters, numbers, and underscores'
      )
    }

    // Reserved field names (prevent conflicts with PostContent entity properties)
    const reserved = [
      'id',
      'title',
      'slug',
      'excerpt',
      'status',
      'author',
      'created_at',
      'updated_at',
      'deleted_at',
      'field_data',
      'metadata'
    ]
    if (reserved.includes(name)) {
      throw new BadRequestException(`Field name '${name}' is reserved`)
    }
  }

  /**
   * Validate field definition configuration
   * @param field - Field definition to validate
   */
  validateFieldDefinition(
    field: Partial<{
      fieldType: FieldType
      label: string
      defaultValue: string | null
      validationRules: Record<string, unknown>
      fieldOptions: Record<string, unknown>
    }>
  ): void {
    // Label validation
    if (field.label && (field.label.length < 1 || field.label.length > 200)) {
      throw new BadRequestException('Label must be between 1 and 200 characters')
    }

    // Validation rules validation (basic - Phase 2 will have comprehensive validation)
    if (field.validationRules) {
      // Check for valid rule types based on field type
      if (field.fieldType === FieldType.TEXT || field.fieldType === FieldType.TEXTAREA) {
        if (
          field.validationRules.minLength &&
          typeof field.validationRules.minLength !== 'number'
        ) {
          throw new BadRequestException('minLength must be a number')
        }
        if (
          field.validationRules.maxLength &&
          typeof field.validationRules.maxLength !== 'number'
        ) {
          throw new BadRequestException('maxLength must be a number')
        }
      }

      if (field.fieldType === FieldType.NUMBER || field.fieldType === FieldType.CURRENCY) {
        if (field.validationRules.min && typeof field.validationRules.min !== 'number') {
          throw new BadRequestException('min must be a number')
        }
        if (field.validationRules.max && typeof field.validationRules.max !== 'number') {
          throw new BadRequestException('max must be a number')
        }
      }
    }

    // Field options validation (basic - Phase 2 will have comprehensive validation)
    if (field.fieldOptions) {
      // Validate choices for select/radio/multiselect
      if (
        [FieldType.SELECT, FieldType.RADIO, FieldType.MULTISELECT].includes(
          field.fieldType as FieldType
        )
      ) {
        if (!field.fieldOptions.choices || !Array.isArray(field.fieldOptions.choices)) {
          throw new BadRequestException(
            'choices must be an array for select/radio/multiselect fields'
          )
        }
        if ((field.fieldOptions.choices as unknown[]).length === 0) {
          throw new BadRequestException(
            'choices array cannot be empty for select/radio/multiselect fields'
          )
        }
      }
    }
  }
}
