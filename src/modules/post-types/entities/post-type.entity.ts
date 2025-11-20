import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index
} from 'typeorm'
import { User } from '../../users/entities/user.entity'
import { FieldDefinition } from './field-definition.entity'

/**
 * PostType Entity
 *
 * Defines a custom post type (like WordPress post types: Event, Product, Recipe, etc.)
 * Each post type can have multiple custom fields via FieldDefinition relationships.
 *
 * Example post types:
 * - Event (with fields: event_date, location, max_attendees)
 * - Product (with fields: price, sku, stock_quantity)
 * - Recipe (with fields: prep_time, servings, ingredients)
 *
 * Key Features:
 * - JSONB settings for flexible configuration
 * - Hierarchical support for nested content
 * - REST API configuration
 * - System protection flag
 * - Full audit trail
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Entity({ name: 'post_types' })
@Index('IDX_POST_TYPES_SLUG', ['slug'], { unique: true })
@Index('IDX_POST_TYPES_NAME', ['name'])
@Index('IDX_POST_TYPES_ACTIVE', ['isActive'])
@Index('IDX_POST_TYPES_SYSTEM', ['isSystem'])
@Index('IDX_POST_TYPES_DELETED_AT', ['deletedAt'])
export class PostType {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 100, unique: true })
  @Index()
  name: string

  @Column({ length: 120, unique: true })
  @Index()
  slug: string

  @Column({ length: 100, name: 'singularLabel' })
  singularLabel: string

  @Column({ length: 100, name: 'pluralLabel' })
  pluralLabel: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ length: 50, nullable: true })
  icon?: string

  @Column({ length: 50, nullable: true, name: 'menuIcon' })
  menuIcon?: string

  @Column({ type: 'integer', nullable: true, name: 'menuPosition' })
  menuPosition?: number

  @Column({ type: 'boolean', default: false, name: 'isHierarchical' })
  isHierarchical: boolean

  @Column({ type: 'boolean', default: true, name: 'supportsComments' })
  supportsComments: boolean

  @Column({ type: 'boolean', default: true, name: 'supportsRevisions' })
  supportsRevisions: boolean

  @Column({ type: 'boolean', default: true, name: 'showInRest' })
  showInRest: boolean

  @Column({ length: 100, nullable: true, name: 'restBase' })
  restBase?: string

  @Column({ length: 50, nullable: true, name: 'capabilityType' })
  capabilityType?: string

  @Column({ type: 'boolean', default: true, name: 'isActive' })
  @Index()
  isActive: boolean

  @Column({ type: 'boolean', default: false, name: 'isSystem' })
  @Index()
  isSystem: boolean

  /**
   * JSONB column for flexible configuration
   * Example structure:
   * {
   *   "supports": ["thumbnail", "excerpt", "comments"],
   *   "taxonomies": ["category", "tag"],
   *   "customSettings": {
   *     "enableScheduling": true,
   *     "requireApproval": false
   *   }
   * }
   */
  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, any>

  // ========== Relationships ==========

  /**
   * One post type has many field definitions
   * Example: "Event" post type has fields: event_date, location, price
   */
  @OneToMany(() => FieldDefinition, fieldDef => fieldDef.postType)
  fieldDefinitions: FieldDefinition[]

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
   * Get the full REST API path
   * Example: "events" → "/api/content/events"
   */
  get restPath(): string {
    return `/api/content/${this.restBase || this.slug}`
  }

  /**
   * Check if this post type can be deleted
   * System post types cannot be deleted
   */
  get isDeletable(): boolean {
    return !this.isSystem
  }

  /**
   * Get display name based on context
   * @param plural - Return plural or singular label
   */
  getDisplayName(plural = false): string {
    return plural ? this.pluralLabel : this.singularLabel
  }
}
