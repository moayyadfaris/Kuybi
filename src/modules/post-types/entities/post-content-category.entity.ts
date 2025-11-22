import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { Category } from '../../categories/entities/category.entity'

import { PostContent } from './post-content.entity'

/**
 * PostContentCategory Entity
 *
 * Junction table linking post content to categories (many-to-many).
 * Supports hierarchical categorization with primary category designation.
 *
 * Use cases:
 * - Product in "Electronics" and "Sale Items" categories
 * - Event in "Conferences" and "Technology" categories
 * - Recipe in "Desserts" and "Quick Meals" categories
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Entity({ name: 'post_content_categories' })
@Index('IDX_POST_CONTENT_CATEGORIES_UNIQUE', ['postContentId', 'categoryId'], { unique: true })
@Index('IDX_POST_CONTENT_CATEGORIES_CONTENT', ['postContentId'])
@Index('IDX_POST_CONTENT_CATEGORIES_CATEGORY', ['categoryId'])
@Index('IDX_POST_CONTENT_CATEGORIES_PRIMARY', ['postContentId', 'isPrimary'])
export class PostContentCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'postContentId' })
  postContentId: string

  @ManyToOne(() => PostContent, content => content.categoryRelations, {
    nullable: false,
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'postContentId' })
  postContent: PostContent

  @Column({ type: 'uuid', name: 'categoryId' })
  categoryId: string

  @ManyToOne(() => Category, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: Category

  @Column({ type: 'boolean', default: false, name: 'isPrimary' })
  isPrimary: boolean

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt: Date
}
