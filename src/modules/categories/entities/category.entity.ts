import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable
} from 'typeorm'

@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 120 })
  name: string

  @Column({ length: 140, unique: true })
  slug: string

  @Column({ length: 500, nullable: true })
  description?: string

  @Column({ default: true })
  isActive: boolean

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>

  @Column({ nullable: true })
  createdBy?: string

  @Column({ nullable: true })
  updatedBy?: string

  @Column({ nullable: true })
  deletedBy?: string

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date

  @Column({ default: 1 })
  version: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  // Many-to-many relationship with stories
  @ManyToMany('Story', 'categories')
  stories?: any[]
}
