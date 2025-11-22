import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { Attachment } from '../../attachments/entities/attachment.entity'
import { Country } from '../../countries/entities/country.entity'
import { Tag } from '../../tags/entities/tag.entity'
import { User } from '../../users/entities/user.entity'

export enum StoryType {
  TIP_OFF = 'TIP_OFF',
  STORY = 'STORY',
  REPORT = 'REPORT'
}

export enum StoryStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
  SUSPENDED = 'SUSPENDED',
  FLAGGED = 'FLAGGED',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION'
}

export enum StoryPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

@Entity({ name: 'stories' })
export class Story {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({ length: 200 })
  title: string

  @Column({ type: 'text', nullable: true })
  details?: string

  @Column({
    type: 'enum',
    enum: StoryType,
    default: StoryType.STORY
  })
  type: StoryType

  @Column({ type: 'uuid', nullable: true })
  userId?: string

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User

  @Column({
    type: 'enum',
    enum: StoryStatus,
    default: StoryStatus.DRAFT
  })
  status: StoryStatus

  @Column({ type: 'timestamptz', nullable: true })
  fromTime?: Date

  @Column({ type: 'timestamptz', nullable: true })
  toTime?: Date

  @Column({
    type: 'enum',
    enum: StoryPriority,
    default: StoryPriority.NORMAL
  })
  priority: StoryPriority

  @Column({ default: false })
  isInEditMode: boolean

  @Column({ type: 'integer', nullable: true })
  parentId?: number

  @ManyToOne(() => Story, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent?: Story

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>

  @Column({ type: 'text', nullable: true })
  internalNotes?: string

  @Column({ type: 'uuid', nullable: true })
  createdBy?: string

  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string

  @Column({ type: 'uuid', nullable: true })
  deletedBy?: string

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date

  @Column({ type: 'uuid', nullable: true })
  lastModifiedBy?: string

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lastModifiedBy' })
  lastModifier?: User

  @Column({ default: 1 })
  version: number

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude?: number

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude?: number

  @Column({ length: 255, nullable: true })
  address?: string

  @Column({ length: 100, nullable: true })
  city?: string

  @Column({ length: 100, nullable: true })
  region?: string

  @Column({ type: 'integer', nullable: true })
  countryId?: number

  @ManyToOne(() => Country, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'countryId' })
  country?: Country

  @Column({ type: 'uuid', nullable: true })
  mainImageId?: string

  @ManyToOne(() => Attachment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'mainImageId' })
  mainImage?: Attachment

  @Column({ length: 255, nullable: true })
  deletionReason?: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  // Many-to-many relationship with attachments through story_attachments junction table
  @ManyToMany(() => Attachment, { cascade: false })
  @JoinTable({
    name: 'story_attachments',
    joinColumn: { name: 'storyId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'attachmentId', referencedColumnName: 'id' }
  })
  attachments?: Attachment[]

  // Many-to-many relationship with tags through story_tags junction table
  @ManyToMany(() => Tag, { cascade: false })
  @JoinTable({
    name: 'story_tags',
    joinColumn: { name: 'storyId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' }
  })
  tags?: Tag[]

  // Many-to-many relationship with categories through story_categories junction table
  @ManyToMany('Category', 'stories', { cascade: false })
  @JoinTable({
    name: 'story_categories',
    joinColumn: { name: 'storyId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' }
  })
  categories?: any[]
}
