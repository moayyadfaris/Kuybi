import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { User } from '../../users/entities/user.entity'

/**
 * Password History Entity
 * Stores historical password hashes to prevent password reuse
 * Automatically cleaned up to keep last 5 entries per user
 */
@Entity({ name: 'password_history' })
@Index(['userId', 'createdAt'])
export class PasswordHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  userId: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User

  @Column({
    type: 'text',
    comment: 'Bcrypt hashed password'
  })
  passwordHash: string

  @CreateDateColumn({
    type: 'timestamptz',
    comment: 'When this password was set'
  })
  createdAt: Date

  @Column({
    length: 45,
    nullable: true,
    comment: 'IP address from which password was changed'
  })
  ipAddress?: string

  @Column({
    length: 255,
    nullable: true,
    comment: 'User agent string'
  })
  userAgent?: string
}
