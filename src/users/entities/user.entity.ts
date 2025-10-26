import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import { UserRole } from '../../acl/entities/user-role.entity'
import { Action } from '../../acl/types/actions.enum'
import { Subject } from '../../acl/types/subjects.enum'

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 50 })
  name: string

  @Column({ length: 50, unique: true })
  email: string

  @Column({ length: 50, unique: true })
  mobileNumber: string

  @Column({ type: 'text' })
  passwordHash: string

  @Column({ length: 20, default: 'ROLE_USER' })
  role: string

  @Column({ default: true })
  isActive: boolean

  @Column({ default: false })
  isVerified: boolean

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles: UserRole[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  /**
   * Check if user has a specific role
   */
  hasRole(roleName: string): boolean {
    if (!this.userRoles) {
      return false
    }

    const now = new Date()
    return this.userRoles.some(
      (userRole) =>
        userRole.role.name === roleName &&
        userRole.isActive &&
        (!userRole.expiresAt || userRole.expiresAt > now),
    )
  }

  /**
   * Get all active role names for this user
   */
  getRoles(): string[] {
    if (!this.userRoles) {
      return []
    }

    const now = new Date()
    return this.userRoles
      .filter(
        (userRole) =>
          userRole.isActive &&
          (!userRole.expiresAt || userRole.expiresAt > now),
      )
      .map((userRole) => userRole.role.name)
  }

  /**
   * Check if user is a super admin
   */
  isSuperAdmin(): boolean {
    return this.hasRole('super-admin')
  }

  /**
   * Check if user is an admin
   */
  isAdmin(): boolean {
    return this.hasRole('admin') || this.isSuperAdmin()
  }
}
