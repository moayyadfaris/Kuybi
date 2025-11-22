import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { User } from '../../users/entities/user.entity'
import { FieldType } from '../enums/field-type.enum'

import { PostType } from './post-type.entity'

/**
 * FieldDefinition Entity
 *
 * Defines a custom field schema for a post type (like ACF fields in WordPress).
 * Each field definition specifies the field type, validation rules, and display options.
 *
 * Example field definitions:
 * - Event.event_date: { type: 'date', required: true, validation: { minDate: 'today' } }
 * - Product.price: { type: 'currency', required: true, validation: { min: 0 } }
 * - Recipe.ingredients: { type: 'repeater', validation: { min: 1 } }
 *
 * Key Features:
 * - 25 field types (text, number, date, select, file, relation, etc.)
 * - JSONB validation_rules for flexible validation
 * - JSONB field_options for type-specific config
 * - JSONB conditional_logic for show/hide rules
 * - Display ordering and grouping
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Entity({ name: 'field_definitions' })
@Index('IDX_FIELD_DEFINITIONS_POST_TYPE', ['postTypeId'])
@Index('IDX_FIELD_DEFINITIONS_NAME', ['name'])
@Index('IDX_FIELD_DEFINITIONS_TYPE', ['fieldType'])
@Index('IDX_FIELD_DEFINITIONS_REQUIRED', ['isRequired'])
@Index('IDX_FIELD_DEFINITIONS_POST_TYPE_ORDER', ['postTypeId', 'displayOrder'])
@Index('IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE', ['postTypeId', 'name'], { unique: true })
@Index('IDX_FIELD_DEFINITIONS_DELETED_AT', ['deletedAt'])
export class FieldDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // ========== Relationship to Post Type ==========

  @Column({ type: 'uuid', name: 'postTypeId' })
  postTypeId: string

  @ManyToOne(() => PostType, postType => postType.fieldDefinitions, {
    nullable: false,
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'postTypeId' })
  postType: PostType

  // ========== Field Identity ==========

  @Column({ length: 100 })
  @Index()
  name: string

  @Column({ length: 200 })
  label: string

  @Column({
    type: 'enum',
    enum: FieldType,
    name: 'fieldType'
  })
  @Index()
  fieldType: FieldType

  @Column({ type: 'text', nullable: true })
  description?: string

  // ========== Default Values & Placeholder ==========

  @Column({ type: 'text', nullable: true, name: 'defaultValue' })
  defaultValue?: string

  @Column({ length: 200, nullable: true })
  placeholder?: string

  // ========== Validation Flags ==========

  @Column({ type: 'boolean', default: false, name: 'isRequired' })
  @Index()
  isRequired: boolean

  @Column({ type: 'boolean', default: false, name: 'isUnique' })
  isUnique: boolean

  @Column({ type: 'boolean', default: true, name: 'isSearchable' })
  isSearchable: boolean

  @Column({ type: 'boolean', default: true, name: 'isFilterable' })
  isFilterable: boolean

  @Column({ type: 'boolean', default: true, name: 'isSortable' })
  isSortable: boolean

  // ========== Display Configuration ==========

  @Column({ type: 'integer', default: 0, name: 'displayOrder' })
  displayOrder: number

  @Column({ length: 100, nullable: true, name: 'fieldGroup' })
  fieldGroup?: string

  @Column({ type: 'text', nullable: true, name: 'helpText' })
  helpText?: string

  // ========== JSONB Configuration ==========

  /**
   * Validation rules (flexible per field type)
   * Examples:
   * - Text: { "minLength": 5, "maxLength": 100, "pattern": "^[a-z]+$" }
   * - Number: { "min": 0, "max": 1000, "integer": true }
   * - Date: { "minDate": "2025-01-01", "maxDate": "2025-12-31" }
   * - Email: { "pattern": "^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$" }
   */
  @Column({ type: 'jsonb', default: {}, name: 'validationRules' })
  validationRules: Record<string, any>

  /**
   * Field-specific options (varies by field type)
   * Examples:
   * - Select: { "choices": ["option1", "option2"], "allowOther": true }
   * - Relation: { "targetPostType": "product", "multiple": true, "createNew": false }
   * - File: { "allowedTypes": ["image/jpeg", "image/png"], "maxSize": 5242880 }
   * - Repeater: { "subFields": [...], "min": 1, "max": 10 }
   */
  @Column({ type: 'jsonb', default: {}, name: 'fieldOptions' })
  fieldOptions: Record<string, any>

  /**
   * Conditional logic for showing/hiding field
   * Example: { "show_if": { "fieldId": "uuid", "operator": "equals", "value": "yes" } }
   */
  @Column({ type: 'jsonb', nullable: true, name: 'conditionalLogic' })
  conditionalLogic?: Record<string, any>

  /**
   * Additional metadata
   */
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>

  // ========== Audit Trail ==========

  @Column({ type: 'uuid', nullable: true, name: 'createdBy' })
  createdBy?: string

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator?: User

  @Column({ type: 'uuid', nullable: true, name: 'updatedBy' })
  updatedBy?: string

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updatedBy' })
  updater?: User

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt: Date

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, name: 'deletedAt' })
  @Index()
  deletedAt?: Date

  // ========== Optimistic Locking ==========

  @Column({ type: 'integer', default: 1 })
  version: number

  // ========== Computed Properties ==========

  /**
   * Get full field identifier (postType.fieldName)
   * Example: "event.event_date"
   */
  get fullName(): string {
    return `${this.postType?.slug || 'unknown'}.${this.name}`
  }

  /**
   * Check if field has conditional logic
   */
  get isConditional(): boolean {
    return !!this.conditionalLogic && Object.keys(this.conditionalLogic).length > 0
  }

  /**
   * Get validation rule summary for display
   */
  getValidationSummary(): string {
    const rules: string[] = []

    if (this.isRequired) rules.push('Required')
    if (this.isUnique) rules.push('Unique')
    if (this.validationRules.minLength) rules.push(`Min: ${this.validationRules.minLength}`)
    if (this.validationRules.maxLength) rules.push(`Max: ${this.validationRules.maxLength}`)
    if (this.validationRules.min !== undefined) rules.push(`Min: ${this.validationRules.min}`)
    if (this.validationRules.max !== undefined) rules.push(`Max: ${this.validationRules.max}`)

    return rules.length > 0 ? rules.join(', ') : 'No constraints'
  }
}
