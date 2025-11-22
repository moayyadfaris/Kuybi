import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { RolePermission } from './role-permission.entity'
import { UserRole } from './user-role.entity'

/**
 * Role entity for RBAC (Role-Based Access Control)
 * Represents a role that can be assigned to users
 */
@Entity({ name: 'roles' })
export class Role {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({ unique: true, length: 50 })
  name: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({ default: false })
  isSystem: boolean // System roles cannot be deleted/modified

  @Column({ default: true })
  isActive: boolean

  @Column({ default: 50 })
  priority: number // Higher priority = more permissions (1-100)

  @OneToMany(() => RolePermission, rolePermission => rolePermission.role, {
    cascade: true
  })
  rolePermissions: RolePermission[]

  @OneToMany(() => UserRole, userRole => userRole.role)
  userRoles: UserRole[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt?: Date
}
