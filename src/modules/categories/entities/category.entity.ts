import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { Story } from '../../stories/entities/story.entity'

@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 120 })
  name: string

  @Column({ length: 140, unique: true })
  slug: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null

  @Column({ default: true })
  isActive: boolean

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>

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

  // Many-to-many relationship with stories
  @ManyToMany(() => Story, story => story.categories)
  stories?: Story[]
}
