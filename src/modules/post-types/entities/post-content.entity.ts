import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  Index
} from 'typeorm'
import { User } from '../../users/entities/user.entity'
import { Attachment } from '../../attachments/entities/attachment.entity'
import { PostType } from './post-type.entity'
import { PostContentAttachment } from './post-content-attachment.entity'
import { PostContentTag } from './post-content-tag.entity'
import { PostContentCategory } from './post-content-category.entity'
import { ContentStatus } from '../enums/content-status.enum'

/**
 * PostContent Entity
 *
 * Represents an actual content instance of a post type.
 * This is THE CORE entity where all custom field data is stored in the field_data JSONB column.
 *
 * Examples:
 * - Event: "Annual Tech Conference 2025" with field_data: { event_date: "2025-06-15", location: "NYC", price: 49.99 }
 * - Product: "iPhone 16" with field_data: { sku: "IPHONE16-128", price: 999, stock: 50 }
 * - Recipe: "Chocolate Cake" with field_data: { prep_time: 30, servings: 8, ingredients: [...] }
 *
 * Key Features:
 * - JSONB field_data stores ALL custom field values dynamically
 * - Publishing workflow (draft → review → published → archived)
 * - Hierarchical support (parent-child relationships)
 * - SEO metadata
 * - Engagement metrics (views, likes, comments)
 * - Full-text search on title + excerpt
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Entity({ name: 'post_content' })
@Index('IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE', ['postTypeId', 'slug'], { unique: true })
@Index('IDX_POST_CONTENT_POST_TYPE', ['postTypeId'])
@Index('IDX_POST_CONTENT_STATUS', ['status'])
@Index('IDX_POST_CONTENT_AUTHOR', ['authorId'])
@Index('IDX_POST_CONTENT_TYPE_STATUS', ['postTypeId', 'status'])
@Index('IDX_POST_CONTENT_PUBLISHED_AT', ['publishedAt'])
@Index('IDX_POST_CONTENT_SCHEDULED_AT', ['scheduledAt'])
@Index('IDX_POST_CONTENT_PARENT', ['parentId'])
@Index('IDX_POST_CONTENT_HIERARCHY_PATH', ['hierarchyPath'])
@Index('IDX_POST_CONTENT_FEATURED', ['isFeatured'])
@Index('IDX_POST_CONTENT_PINNED', ['isPinned'])
@Index('IDX_POST_CONTENT_DELETED_AT', ['deletedAt'])
export class PostContent {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // ========== Relationship to Post Type ==========

  @Column({ type: 'uuid', name: 'postTypeId' })
  postTypeId: string

  @ManyToOne(() => PostType, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'postTypeId' })
  postType: PostType

  // ========== Basic Content ==========

  @Column({ length: 300 })
  title: string

  @Column({ length: 320 })
  @Index()
  slug: string

  @Column({ type: 'text', nullable: true })
  excerpt?: string

  // ========== CRITICAL: Dynamic Field Data (JSONB) ==========

  /**
   * ALL custom field values stored here as JSONB
   * Structure: { "field_name": "value", "field_name2": "value2", ... }
   *
   * Examples:
   * - Event: { "event_date": "2025-06-15", "location": "New York", "price": 49.99, "max_attendees": 100 }
   * - Product: { "sku": "PROD-001", "price": 29.99, "stock_quantity": 50, "weight": 1.5 }
   * - Recipe: { "prep_time": 30, "cook_time": 45, "servings": 4, "difficulty": "medium" }
   *
   * This is what makes the system dynamic - no schema changes needed for new fields!
   */
  @Column({ type: 'jsonb', default: {}, name: 'fieldData' })
  fieldData: Record<string, unknown>

  // ========== Featured Image ==========

  @Column({ type: 'uuid', nullable: true, name: 'featuredImageId' })
  featuredImageId?: string

  @ManyToOne(() => Attachment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'featuredImageId' })
  featuredImage?: Attachment

  // ========== Publishing Workflow ==========

  @Column({
    type: 'enum',
    enum: ContentStatus,
    default: ContentStatus.DRAFT
  })
  @Index()
  status: ContentStatus

  @Column({ type: 'uuid', name: 'authorId' })
  authorId: string

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorId' })
  author: User

  @Column({ type: 'timestamptz', nullable: true, name: 'publishedAt' })
  @Index()
  publishedAt?: Date

  @Column({ type: 'timestamptz', nullable: true, name: 'scheduledAt' })
  @Index()
  scheduledAt?: Date

  // ========== Hierarchical Support ==========

  @Column({ type: 'uuid', nullable: true, name: 'parentId' })
  parentId?: string

  @ManyToOne(() => PostContent, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent?: PostContent

  @OneToMany(() => PostContent, (content) => content.parent)
  children: PostContent[]

  @Column({ type: 'integer', default: 0, name: 'hierarchyLevel' })
  hierarchyLevel: number

  @Column({ length: 500, nullable: true, name: 'hierarchyPath' })
  @Index()
  hierarchyPath?: string

  @Column({ type: 'integer', default: 0, name: 'displayOrder' })
  displayOrder: number

  // ========== SEO Metadata ==========

  @Column({ length: 100, nullable: true, name: 'metaTitle' })
  metaTitle?: string

  @Column({ length: 300, nullable: true, name: 'metaDescription' })
  metaDescription?: string

  @Column({ type: 'text', nullable: true, name: 'metaKeywords' })
  metaKeywords?: string

  // ========== Engagement Metrics ==========

  @Column({ type: 'integer', default: 0, name: 'viewCount' })
  viewCount: number

  @Column({ type: 'integer', default: 0, name: 'likeCount' })
  likeCount: number

  @Column({ type: 'integer', default: 0, name: 'commentCount' })
  commentCount: number

  // ========== Features ==========

  @Column({ type: 'boolean', default: false, name: 'isFeatured' })
  @Index()
  isFeatured: boolean

  @Column({ type: 'boolean', default: false, name: 'isPinned' })
  @Index()
  isPinned: boolean

  @Column({ type: 'boolean', default: true, name: 'allowComments' })
  allowComments: boolean

  // ========== Additional Metadata ==========

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>

  // ========== Relationships (Many-to-Many via Junction Tables) ==========

  @OneToMany(() => PostContentAttachment, (pca) => pca.postContent)
  attachmentRelations: PostContentAttachment[]

  @OneToMany(() => PostContentTag, (pct) => pct.postContent)
  tagRelations: PostContentTag[]

  @OneToMany(() => PostContentCategory, (pcc) => pcc.postContent)
  categoryRelations: PostContentCategory[]

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
   * Check if content is published
   */
  get isPublished(): boolean {
    return this.status === ContentStatus.PUBLISHED && !!this.publishedAt
  }

  /**
   * Check if content is scheduled for future publication
   */
  get isScheduled(): boolean {
    return this.status === ContentStatus.SCHEDULED && !!this.scheduledAt && this.scheduledAt > new Date()
  }

  /**
   * Check if content is in draft state
   */
  get isDraft(): boolean {
    return this.status === ContentStatus.DRAFT
  }

  /**
   * Get SEO title (use metaTitle if set, otherwise title)
   */
  get seoTitle(): string {
    return this.metaTitle || this.title
  }

  /**
   * Get SEO description (use metaDescription if set, otherwise excerpt)
   */
  get seoDescription(): string {
    return this.metaDescription || this.excerpt || ''
  }

  /**
   * Get field value from field_data JSONB by field name
   * @param fieldName - The field name to retrieve
   */
  getFieldValue<T = unknown>(fieldName: string): T | undefined {
    return this.fieldData[fieldName] as T | undefined
  }

  /**
   * Set field value in field_data JSONB
   * @param fieldName - The field name to set
   * @param value - The value to set
   */
  setFieldValue(fieldName: string, value: unknown): void {
    this.fieldData = {
      ...this.fieldData,
      [fieldName]: value
    }
  }

  /**
   * Get all field names from field_data
   */
  getFieldNames(): string[] {
    return Object.keys(this.fieldData)
  }

  /**
   * Check if field exists in field_data
   */
  hasField(fieldName: string): boolean {
    return fieldName in this.fieldData
  }
}
