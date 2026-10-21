import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'

import type { AclPrincipal } from '@modules/acl'
import { liveRoles, Role, UserRole } from '@modules/acl/entities'
import { Attachment } from '@modules/attachments/entities'

@Index('IDX_USERS_PROFILE_IMAGE', ['profileImageId'])
@Entity({ name: 'users' })
export class User implements AclPrincipal {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ length: 50 })
  name: string

  @Column({ length: 50, unique: true })
  email: string

  /** Optional; null when not given (unique when present: '' would allow only one user) */
  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  mobileNumber: string | null

  // Never selected by default, so the hash cannot leak through relations, query results
  // or the cache. Load it explicitly via UserRepository.findPasswordHash().
  @Column({ type: 'text', select: false })
  passwordHash: string

  @Index()
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

  /**
   * When the password was last replaced without the user's own session (reset by email
   * or by an admin). Access tokens issued and sessions created before it are void: written
   * with the password in one transaction, it ends earlier access even if revoking the
   * sessions (another step, another module) did not happen.
   */
  @Column({ type: 'timestamptz', nullable: true })
  credentialsChangedAt: Date | null

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment:
      'Reason for account lock: FAILED_ATTEMPTS or ADMIN_LOCK (or a reason given by an admin)'
  })
  lockReason: string | null

  @Column({ type: 'uuid', nullable: true })
  profileImageId?: string | null

  @ManyToOne(() => Attachment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'profileImageId' })
  profileImage?: Attachment

  @OneToMany(() => UserRole, userRole => userRole.user)
  userRoles: UserRole[]

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  /** 'user' when the primary role is not loaded */
  getPrimaryRoleName(): string {
    return this.primaryRole?.name || 'user'
  }

  /** The highest-ranking live role (see liveRoles); null when none is live */
  getHighestPriorityRole(): Role | null {
    return liveRoles(this).reduce<Role | null>(
      (highest, role) => (!highest || role.priority > highest.priority ? role : highest),
      null
    )
  }

  /** Whether a live role (primary or additional) has this name */
  hasRole(roleName: string): boolean {
    return liveRoles(this).some(role => role.name === roleName)
  }

  /**
   * Check if user is a super admin
   */
  isSuperAdmin(): boolean {
    return this.hasRole('super-admin')
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
}
