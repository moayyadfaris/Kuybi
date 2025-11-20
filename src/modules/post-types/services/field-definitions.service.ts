import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException
} from '@nestjs/common'
import { FieldDefinition } from '../entities/field-definition.entity'
import { FieldDefinitionRepository } from '../repositories/field-definition.repository'
import { PostTypesService } from './post-types.service'
import { FieldType } from '../enums/field-type.enum'

/**
 * FieldDefinitionsService
 *
 * Business logic for managing field definitions (custom fields for post types).
 * Handles CRUD operations, validation, ordering, and cache invalidation.
 *
 * Key Responsibilities:
 * - Create/Read/Update/Delete field definitions
 * - Validate field configuration and rules
 * - Reorder fields within a post type
 * - Prevent duplicate field names per post type
 * - Cache invalidation on mutations
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Injectable()
export class FieldDefinitionsService {
  constructor(
    private readonly fieldDefinitionRepository: FieldDefinitionRepository,
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

    // Validate field definition
    this.validateFieldDefinition(data)

    // Get next display order if not provided
    const displayOrder =
      data.displayOrder ?? (await this.fieldDefinitionRepository.getNextDisplayOrder(postTypeId))

    // Create field definition
    const fieldDefinition = await this.fieldDefinitionRepository.save({
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

    // Invalidate caches
    await this.fieldDefinitionRepository.invalidateCacheForPostType(postTypeId)

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
   * Find required fields for a post type
   * @param postTypeId - Post type UUID
   */
  async findRequiredFields(postTypeId: string): Promise<FieldDefinition[]> {
    return this.fieldDefinitionRepository.findRequiredFields(postTypeId)
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
    },
    updatedBy?: string
  ): Promise<FieldDefinition> {
    const field = await this.findOne(id)

    // Validate field definition
    this.validateFieldDefinition({ ...field, ...data })

    // Update field
    Object.assign(field, {
      ...data,
      updatedBy,
      version: field.version + 1 // Optimistic locking
    })

    const updated = await this.fieldDefinitionRepository.save(field)

    // Invalidate caches
    await this.fieldDefinitionRepository.invalidateCache(updated)

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

    // Use TypeORM's softDelete directly
    await this.fieldDefinitionRepository.getRepository().softDelete(id)

    // Invalidate caches for this post type
    await this.fieldDefinitionRepository.invalidateCacheForPostType(fieldDefinition.postTypeId)
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
      defaultValue: string
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
