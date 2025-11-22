import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { User } from '../../users/entities/user.entity'

@Entity({ name: 'attachments' })
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User

  @Column({ type: 'uuid' })
  userId: string

  @Column({ length: 1024 })
  path: string

  @Column({ length: 150 })
  mimeType: string

  @Column()
  size: number

  @Column({ length: 255 })
  originalName: string

  @Column({ length: 50, nullable: true })
  category?: string

  @Column({ default: false })
  isPublic: boolean

  @Column({ default: false })
  isEncrypted: boolean

  @Column({ nullable: true })
  encryptionKey?: string

  @Column({ length: 20, default: 'pending' })
  securityStatus: string

  @Column({ length: 128, nullable: true })
  checksum?: string

  @Column({ default: 0 })
  downloadCount: number

  @Column({ type: 'timestamptz', nullable: true })
  lastAccessedAt?: Date

  @Column({ length: 100, nullable: true })
  folder?: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[]

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  scanResults?: Record<string, unknown>

  @Column({ default: false })
  containsPII: boolean

  @Column({ length: 20, nullable: true })
  retentionPeriod?: string

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  deletionScheduledAt?: Date

  @Column({ length: 1024, nullable: true })
  thumbnailPath?: string

  @Column({ default: 1 })
  version: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date
}
