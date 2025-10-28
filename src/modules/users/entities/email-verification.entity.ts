import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { User } from './user.entity'

/**
 * Email Verification Entity
 * 
 * Stores email verification tokens for user registration
 * 
 * Features:
 * - Unique verification tokens (UUID v4)
 * - Expiration tracking (24 hours default)
 * - IP and User Agent logging for security
 * - One-time use verification
 * - Tracks verification status and timestamp
 */
@Entity('email_verifications')
@Index(['email'])
@Index(['token'], { unique: true })
@Index(['userId', 'verified'])
@Index(['expiresAt'])
export class EmailVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  @Index()
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User

  @Column({ type: 'varchar', length: 255 })
  @Index()
  email: string

  @Column({ type: 'uuid', unique: true })
  token: string

  @Column({ type: 'timestamp' })
  expiresAt: Date

  @Column({ type: 'boolean', default: false })
  verified: boolean

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null

  @Column({ type: 'text', nullable: true })
  userAgent: string | null

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date

  /**
   * Check if verification token has expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt
  }

  /**
   * Check if token is valid for verification
   */
  isValid(): boolean {
    return !this.verified && !this.isExpired()
  }
}
