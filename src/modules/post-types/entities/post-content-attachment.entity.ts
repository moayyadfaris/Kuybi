import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { Attachment } from '../../attachments/entities/attachment.entity'

import { PostContent } from './post-content.entity'

/**
 * PostContentAttachment Entity
 *
 * Junction table linking post content to multiple attachments (files, images, videos).
 * Supports gallery functionality with display ordering and captions.
 *
 * Use cases:
 * - Product with multiple product images (gallery)
 * - Event with documents (registration form, schedule PDF)
 * - Recipe with step-by-step photos
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Entity({ name: 'post_content_attachments' })
@Index('IDX_POST_CONTENT_ATTACHMENTS_UNIQUE', ['postContentId', 'attachmentId'], { unique: true })
@Index('IDX_POST_CONTENT_ATTACHMENTS_CONTENT', ['postContentId'])
@Index('IDX_POST_CONTENT_ATTACHMENTS_ATTACHMENT', ['attachmentId'])
@Index('IDX_POST_CONTENT_ATTACHMENTS_ORDER', ['postContentId', 'displayOrder'])
export class PostContentAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'postContentId' })
  postContentId: string

  @ManyToOne(() => PostContent, content => content.attachmentRelations, {
    nullable: false,
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'postContentId' })
  postContent: PostContent

  @Column({ type: 'uuid', name: 'attachmentId' })
  attachmentId: string

  @ManyToOne(() => Attachment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attachmentId' })
  attachment: Attachment

  @Column({ type: 'integer', default: 0, name: 'displayOrder' })
  displayOrder: number

  @Column({ type: 'text', nullable: true })
  caption?: string

  @Column({ type: 'boolean', default: false, name: 'isPrimary' })
  isPrimary: boolean

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt: Date
}
