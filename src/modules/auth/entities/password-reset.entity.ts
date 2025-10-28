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
import { User } from '@modules/users/entities/user.entity'

/**
 * Password Reset Entity
 * 
 * Stores password reset tokens for account recovery
 * 
 * Features:
 * - Unique reset tokens (UUID v4)
 * - Short expiration window (1 hour for security)
 * - IP and User Agent logging for both request and reset
 * - One-time use tokens
 * - Tracks used status and timestamp
 * - Audit trail for security monitoring
 * 
 * Security Considerations:
 * - Shorter expiry than email verification (1 hour vs 24 hours)
 * - Tracks both request IP and reset IP (detect suspicious activity)
 * - All old tokens invalidated when new one requested
 * - Token marked as used immediately after successful reset
 */
@Entity('password_resets')
@Index(['email'])
@Index(['token'], { unique: true })
@Index(['userId', 'used'])
@Index(['expiresAt'])
export class PasswordReset {
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
  used: boolean

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null

  /**
   * IP address from which the reset was requested
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  requestIpAddress: string | null

  /**
   * IP address from which the password was actually reset
   * Helps detect if reset was performed from different location than request
   */
  @Column({ type: 'varchar', length: 45, nullable: true })
  resetIpAddress: string | null

  @Column({ type: 'text', nullable: true })
  userAgent: string | null

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date

  /**
   * Check if reset token has expired (1 hour window)
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt
  }

  /**
   * Check if token is valid for password reset
   * Valid means: not used AND not expired
   */
  isValid(): boolean {
    return !this.used && !this.isExpired()
  }
}
