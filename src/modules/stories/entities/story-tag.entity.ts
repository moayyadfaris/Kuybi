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
import { Tag } from '../../tags/entities/tag.entity'

/**
 * Junction table for Story-Tag many-to-many relationship
 */
@Entity({ name: 'story_tags' })
export class StoryTag {
  @PrimaryColumn({ type: 'integer' })
  storyId: number

  @PrimaryColumn({ type: 'integer' })
  tagId: number

  @ManyToOne(() => Story, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'storyId' })
  story: Story

  @ManyToOne(() => Tag, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'tagId' })
  tag: Tag

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
