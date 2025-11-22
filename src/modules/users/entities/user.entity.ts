import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import { Role } from '../../acl/entities/role.entity'
import { UserRole } from '../../acl/entities/user-role.entity'
import { Attachment } from '../../attachments/entities/attachment.entity'

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

  @Column({ name: 'primary_role_id' })
  primaryRoleId: number

  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'primary_role_id' })
  primaryRole: Role

  @Column({ default: true })
  isActive: boolean

  @Column({ default: false })
  isVerified: boolean

  @Column({ default: false })
  isEmailVerified: boolean

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null

  @Column({ default: false })
  forcePasswordChange: boolean

  @Column({ default: 0, comment: 'Number of consecutive failed login attempts' })
  failedLoginAttempts: number

  @Column({ default: false, comment: 'Whether the account is currently locked' })
  isLocked: boolean

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp when the account was locked'
  })
  lockedAt: Date | null

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp when the account will be automatically unlocked'
  })
  lockedUntil: Date | null

  @Column({
    length: 100,
    nullable: true,
    comment: 'Reason for account lock: FAILED_ATTEMPTS, ADMIN_LOCK, SECURITY_VIOLATION'
  })
  lockReason: string | null

  @Column({ type: 'uuid', nullable: true })
  profileImageId?: string

  @ManyToOne(() => Attachment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'profileImageId' })
  profileImage?: Attachment

  @OneToMany(() => UserRole, userRole => userRole.user)
  userRoles: UserRole[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  /**
   * Get the primary role name
   */
  getPrimaryRoleName(): string {
    return this.primaryRole?.name || 'user'
  }

  /**
   * Get user's highest priority role
   */
  getHighestPriorityRole(): Role | null {
    if (!this.userRoles || this.userRoles.length === 0) {
      return this.primaryRole
    }

    const now = new Date()
    const activeRoles = this.userRoles
      .filter(
        userRole =>
          userRole.isActive && userRole.role && (!userRole.expiresAt || userRole.expiresAt > now)
      )
      .map(userRole => userRole.role)

    if (activeRoles.length === 0) {
      return this.primaryRole
    }

    return activeRoles.reduce(
      (highest, role) => (role.priority > (highest?.priority || 0) ? role : highest),
      this.primaryRole
    )
  }

  /**
   * Check if user has a specific role
   */
  hasRole(roleName: string): boolean {
    // Check primary role
    if (this.primaryRole?.name === roleName) {
      return true
    }

    // Check user roles
    if (!this.userRoles) {
      return false
    }

    const now = new Date()
    return this.userRoles.some(
      userRole =>
        userRole.role?.name === roleName &&
        userRole.isActive &&
        (!userRole.expiresAt || userRole.expiresAt > now)
    )
  }

  /**
   * Get all active role names for this user
   */
  getRoles(): string[] {
    const roles = new Set<string>()

    // Add primary role
    if (this.primaryRole) {
      roles.add(this.primaryRole.name)
    }

    // Add user roles
    if (this.userRoles) {
      const now = new Date()
      this.userRoles
        .filter(
          userRole =>
            userRole.isActive && userRole.role && (!userRole.expiresAt || userRole.expiresAt > now)
        )
        .forEach(userRole => roles.add(userRole.role.name))
    }

    return Array.from(roles)
  }

  /**
   * Check if user is a super admin
   */
  isSuperAdmin(): boolean {
    return this.hasRole('super-admin')
  }

  /**
   * Check if user is an admin (including super-admin)
   */
  isAdmin(): boolean {
    return this.hasRole('admin') || this.isSuperAdmin()
  }

  /**
   * Check if user can manage another user based on role hierarchy
   */
  canManageUser(targetUser: User): boolean {
    if (this.isSuperAdmin()) {
      return true // Super admin can manage anyone
    }

    const myPriority = this.getHighestPriorityRole()?.priority || 0
    const targetPriority = targetUser.getHighestPriorityRole()?.priority || 0

    // Can only manage users with lower priority
    return myPriority > targetPriority
  }

  /**
   * Check if user can assign a specific role
   */
  canAssignRole(role: Role): boolean {
    if (this.isSuperAdmin()) {
      return true // Super admin can assign any role
    }

    // Cannot assign super-admin role
    if (role.name === 'super-admin') {
      return false
    }

    const myPriority = this.getHighestPriorityRole()?.priority || 0

    // Can only assign roles with lower priority
    return myPriority > role.priority
  }
}
