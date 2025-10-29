import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm'
import { User } from '../../users/entities/user.entity'

@Entity({ name: 'tags' })
export class Tag {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({ length: 200, unique: true })
  name: string

  @Column({ type: 'uuid' })
  createdBy: string

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  creator: User

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
  metadata?: Record<string, any>

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
