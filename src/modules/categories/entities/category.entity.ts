import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { Story } from '@modules/stories/entities'

@Entity({ name: 'categories' })
// Unique among live categories: a deleted category's slug can be used again
@Index('UQ_CATEGORIES_SLUG_LIVE', ['slug'], { unique: true, where: '"deletedAt" IS NULL' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 120 })
  name: string

  @Column({ length: 140 })
  slug: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null

  @Column({ default: true })
  isActive: boolean

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>

  @Column({ type: 'varchar', nullable: true })
  createdBy?: string | null

  @Column({ type: 'varchar', nullable: true })
  updatedBy?: string | null

  @Column({ type: 'varchar', nullable: true })
  deletedBy?: string | null

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date | null

  @Column({ default: 1 })
  version: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  @ManyToMany(() => Story, story => story.categories)
  stories?: Story[]
}
