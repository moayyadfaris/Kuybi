import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn
} from 'typeorm'
import { User } from '../../users/entities/user.entity'
import { Role } from './role.entity'

/**
 * Junction table for User-Role many-to-many relationship
 * Allows users to have multiple roles with optional expiration
 */
@Entity({ name: 'user_roles' })
export class UserRole {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({ type: 'uuid' })
  userId: string

  @Column()
  roleId: number

  @ManyToOne(() => User, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'userId' })
  user: User

  @ManyToOne(() => Role, role => role.userRoles, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'roleId' })
  role: Role

  @Column({ type: 'uuid', nullable: true })
  assignedBy?: string // User ID who assigned this role

  @Column({ type: 'timestamptz', nullable: true })
  assignedAt?: Date

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date // For temporary role assignments

  @Column({ default: true })
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
