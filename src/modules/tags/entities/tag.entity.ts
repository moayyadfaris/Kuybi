import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { User } from '@modules/users/entities'

/**
 * A story tag. Names are stored trimmed and lowercase, unique among live tags (a deleted
 * tag's name can be used again). System tags are managed by super-admins only.
 */
@Entity({ name: 'tags' })
@Index('UQ_TAGS_NAME_LIVE', ['name'], { unique: true, where: '"deletedAt" IS NULL' })
export class Tag {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({ length: 200 })
  name: string

  /** Null once the creating user is deleted: the tag (and stories' links to it) stay */
  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdBy' })
  creator?: User

  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updatedBy' })
  updater?: User

  @Column({ type: 'uuid', nullable: true })
  deletedBy?: string

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deletedBy' })
  deleter?: User

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>

  @Column({ length: 7, nullable: true })
  color?: string

  @Column({ type: 'integer', default: 0 })
  sortOrder: number

  @Column({ default: false })
  isSystem: boolean

  @Column({ type: 'integer', default: 1 })
  version: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
