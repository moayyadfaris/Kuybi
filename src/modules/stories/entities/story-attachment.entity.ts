import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  PrimaryColumn
} from 'typeorm'
import { Story } from './story.entity'
import { Attachment } from '../../attachments/entities/attachment.entity'

/**
 * Junction table for Story-Attachment many-to-many relationship
 */
@Entity({ name: 'story_attachments' })
export class StoryAttachment {
  @PrimaryColumn({ type: 'integer' })
  storyId: number

  @PrimaryColumn({ type: 'uuid' })
  attachmentId: string

  @ManyToOne(() => Story, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'storyId' })
  story: Story

  @ManyToOne(() => Attachment, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'attachmentId' })
  attachment: Attachment

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
