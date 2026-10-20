import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'

import { User } from '@modules/users/entities'

import { Role } from './role.entity'

/**
 * Junction table for User-Role many-to-many relationship
 * Allows users to have multiple roles with optional expiration
 */
@Index('IDX_USER_ROLES_USER', ['userId'])
@Index('IDX_USER_ROLES_ROLE', ['roleId'])
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
  assignedBy?: string | null // User ID who assigned this role

  @Column({ type: 'timestamptz', nullable: true })
  assignedAt?: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null // For temporary role assignments

  @Column({ default: true })
  isActive: boolean

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
