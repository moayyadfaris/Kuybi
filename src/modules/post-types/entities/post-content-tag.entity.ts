import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm'
import { PostContent } from './post-content.entity'
import { Tag } from '../../tags/entities/tag.entity'

/**
 * PostContentTag Entity
 *
 * Junction table linking post content to tags (many-to-many).
 * Enables content tagging for better organization and discovery.
 *
 * Use cases:
 * - Event tagged with "conference", "tech", "networking"
 * - Product tagged with "sale", "new-arrival", "featured"
 * - Recipe tagged with "vegetarian", "quick", "healthy"
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Entity({ name: 'post_content_tags' })
@Index('IDX_POST_CONTENT_TAGS_UNIQUE', ['postContentId', 'tagId'], { unique: true })
@Index('IDX_POST_CONTENT_TAGS_CONTENT', ['postContentId'])
@Index('IDX_POST_CONTENT_TAGS_TAG', ['tagId'])
export class PostContentTag {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'postContentId' })
  postContentId: string

  @ManyToOne(() => PostContent, content => content.tagRelations, {
    nullable: false,
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'postContentId' })
  postContent: PostContent

  @Column({ type: 'integer', name: 'tagId' })
  tagId: number

  @ManyToOne(() => Tag, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tagId' })
  tag: Tag

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt: Date
}
