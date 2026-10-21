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
 * Session Entity - Enterprise Session Management
 *
 * Features:
 * - Multi-device session support with device fingerprinting
 * - Security risk assessment (low/medium/high/critical)
 * - Session type classification (standard/persistent/mobile/api/admin)
 * - Rich metadata for analytics and auditing
 * - Soft delete support with deletedAt
 * - Activity tracking with lastActivityAt
 */
/** Allowed session types (same values as the SessionType enum used by the API) */
export type SessionTypeValue =
  'standard' | 'persistent' | 'mobile' | 'api' | 'admin' | 'suspicious' | 'guest'

@Entity({ name: 'sessions' })
@Index(['userId', 'isActive'])
@Index(['expiresAt', 'isActive'])
@Index(['securityLevel'])
@Index(['sessionType'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User

  @Column({ type: 'uuid' })
  userId: string

  /** The user's credentialsVersion when the session was opened; void once it moves on */
  @Column({ type: 'int', default: 0 })
  credentialsVersion: number

  @Column({ type: 'text' })
  refreshTokenHash: string

  // Device & Browser Information
  @Column({ type: 'varchar', length: 200, nullable: true })
  fingerprint?: string

  @Column({ type: 'varchar', length: 120, nullable: true })
  deviceType?: string

  @Column({ type: 'text', nullable: true })
  userAgent?: string

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string

  // Session Classification
  @Column({
    type: 'varchar',
    length: 20,
    default: 'low',
    comment: 'Security risk level: low, medium, high, critical'
  })
  securityLevel: string

  @Column({
    type: 'varchar',
    length: 30,
    default: 'standard',
    comment: 'Session type: standard, persistent, mobile, api, admin, suspicious, guest'
  })
  sessionType: SessionTypeValue

  // Status & Lifecycle
  @Column({ type: 'boolean', default: true })
  isActive: boolean

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  lastActivityAt: Date

  @Column({ type: 'timestamptz' })
  expiresAt: Date

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date

  // Rich Metadata
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>

  @Column({ type: 'jsonb', nullable: true })
  deviceInfo?: Record<string, unknown>

  // Audit Fields
  @Column({ type: 'uuid', nullable: true })
  createdBy?: string

  @Column({ type: 'uuid', nullable: true })
  updatedBy?: string

  @Column({ type: 'uuid', nullable: true })
  deletedBy?: string

  @Column({ type: 'integer', default: 1 })
  version: number

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  // Virtual/Computed properties
  get isExpired(): boolean {
    return this.expiresAt && this.expiresAt.getTime() <= Date.now()
  }

  get remainingTime(): number {
    if (!this.expiresAt) return 0
    return Math.max(0, this.expiresAt.getTime() - Date.now())
  }

  get ageInHours(): number {
    return (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60)
  }
}
