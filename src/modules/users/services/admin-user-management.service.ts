import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { RoleRepository } from '@modules/acl'
import { AuditService } from '@modules/audit'
import { AuditAction, AuditSeverity } from '@modules/audit/entities'

import { EventBus } from '@core/events'

import {
  AdminUpdateUserDto,
  AdminUpdateUserResponseDto,
  UpdatedUserDataDto
} from '../dto/admin-update-user.dto'
import { User } from '../entities/user.entity'
import { UserAccessSuspendedEvent } from '../events/user-access-suspended.event'
import { UserRepository } from '../repositories/user.repository'

/**
 * Super-admin edits of any user field (PATCH /admin/users/:id): profile, primary role,
 * status, lock. Every change is audited. Locking or deactivating ends the user's sessions.
 */
@Injectable()
export class AdminUserManagementService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
    @InjectPinoLogger(AdminUserManagementService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * @throws ConflictException when the email or mobile number belongs to another user
   */
  async updateUser(
    userId: string,
    dto: AdminUpdateUserDto,
    adminId: string,
    adminEmail: string
  ): Promise<AdminUpdateUserResponseDto> {
    // Login looks emails up lowercased and the column is case-sensitive
    const email = dto.email?.trim().toLowerCase()
    const user = await this.userRepository.findById(userId, { bypassCache: true })
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    // Store original values for audit trail
    const originalValues: Record<string, unknown> = {}
    const newValues: Record<string, unknown> = {}
    const changes: string[] = []

    // Validate and prepare updates
    if (dto.primaryRoleId !== undefined) {
      const role = await this.roleRepository.findById(dto.primaryRoleId)
      if (!role) {
        throw new BadRequestException(`Role with ID ${dto.primaryRoleId} not found`)
      }
      if (user.primaryRoleId !== dto.primaryRoleId) {
        originalValues.primaryRoleId = user.primaryRoleId
        newValues.primaryRoleId = dto.primaryRoleId
        newValues.primaryRoleName = role.name
        changes.push(`role changed from ${user.primaryRole?.name || 'none'} to ${role.name}`)
      }
    }

    if (email && email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(email, true)
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException(`Email ${email} is already in use`)
      }
      originalValues.email = user.email
      newValues.email = email
      changes.push(`email changed from ${user.email} to ${email}`)
    }

    // Check for mobile uniqueness
    if (dto.mobileNumber && dto.mobileNumber !== user.mobileNumber) {
      const existingUser = await this.userRepository.findByMobile(dto.mobileNumber)
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException(`Mobile number ${dto.mobileNumber} is already in use`)
      }
      originalValues.mobileNumber = user.mobileNumber
      newValues.mobileNumber = dto.mobileNumber
      changes.push(`mobile number changed`)
    }

    // Track all field changes
    const fieldsToCheck: Array<keyof AdminUpdateUserDto> = [
      'name',
      'isActive',
      'isVerified',
      'isEmailVerified',
      'forcePasswordChange',
      'isLocked',
      'lockReason',
      'failedLoginAttempts'
    ]

    fieldsToCheck.forEach(field => {
      if (dto[field] !== undefined && dto[field] !== user[field as keyof User]) {
        originalValues[field as keyof User] = user[field as keyof User]
        newValues[field] = dto[field]
        changes.push(`${field} changed from ${user[field as keyof User]} to ${dto[field]}`)
      }
    })

    // Locking an account that failed logins locked for a while makes it the admin's lock,
    // which has no end (otherwise it would quietly lift when the failed-login lock ends)
    if (dto.isLocked === true && user.isLocked && user.lockedUntil) {
      changes.push('isLocked made indefinite by an admin')
    }

    if (changes.length === 0) {
      return this.buildResponse(user, adminEmail, dto.reason)
    }

    // Apply updates
    const updateData: Partial<User> = {}
    if (dto.name !== undefined) updateData.name = dto.name
    if (email !== undefined) updateData.email = email
    if (dto.mobileNumber !== undefined) updateData.mobileNumber = dto.mobileNumber
    if (dto.primaryRoleId !== undefined) updateData.primaryRoleId = dto.primaryRoleId
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive
    if (dto.isVerified !== undefined) updateData.isVerified = dto.isVerified
    if (dto.isEmailVerified !== undefined) updateData.isEmailVerified = dto.isEmailVerified
    if (dto.forcePasswordChange !== undefined)
      updateData.forcePasswordChange = dto.forcePasswordChange
    if (dto.isLocked !== undefined) {
      updateData.isLocked = dto.isLocked
      if (dto.isLocked) {
        updateData.lockedAt = new Date()
        updateData.lockReason = dto.lockReason || 'ADMIN_LOCK'
        // Until an admin unlocks it: an end time left from a failed-login lock would let
        // the automatic unlock lift this one
        updateData.lockedUntil = null
      } else {
        updateData.lockedAt = null
        updateData.lockedUntil = null
        updateData.lockReason = null
        // A fresh start: left at the threshold, the counter would never lock again
        updateData.failedLoginAttempts = 0
      }
    }
    if (dto.failedLoginAttempts !== undefined)
      updateData.failedLoginAttempts = dto.failedLoginAttempts

    const updatedUser = await this.userRepository.update(userId, updateData)
    if (!updatedUser) {
      throw new BadRequestException('Failed to update user')
    }

    // Whoever holds the user's sessions loses access now, not at their next login
    const suspended =
      (dto.isLocked === true && !user.isLocked) || (dto.isActive === false && user.isActive)
    if (suspended) {
      await this.eventBus.publish(
        new UserAccessSuspendedEvent(
          userId,
          adminId,
          dto.isLocked ? 'Account locked by administrator' : 'Account deactivated by administrator'
        )
      )
    }

    this.logger.warn(
      { action: 'admin_update_user', userId, adminId, changes: Object.keys(newValues), suspended },
      'Super-admin updated a user'
    )

    await this.auditService.logAction(
      {
        userId: adminId,
        username: adminEmail.split('@')[0],
        email: adminEmail
      },
      {
        action: AuditAction.UPDATE,
        entityType: 'User',
        entityId: userId,
        previousValues: originalValues,
        newValues,
        severity: AuditSeverity.HIGH,
        description: `Super-admin updated user ${user.email}: ${changes.join(', ')}`,
        metadata: {
          targetUserId: userId,
          targetUserEmail: user.email,
          reason: dto.reason,
          changesCount: changes.length
        }
      }
    )

    return this.buildResponse(updatedUser, adminEmail, dto.reason)
  }

  private buildResponse(
    user: User,
    adminEmail: string,
    reason?: string
  ): AdminUpdateUserResponseDto {
    const userData: UpdatedUserDataDto = {
      id: user.id,
      name: user.name,
      email: user.email,
      mobileNumber: user.mobileNumber,
      role: user.getPrimaryRoleName(),
      primaryRoleId: user.primaryRoleId,
      isActive: user.isActive,
      isVerified: user.isVerified,
      isEmailVerified: user.isEmailVerified,
      forcePasswordChange: user.forcePasswordChange,
      isLocked: user.isLocked,
      failedLoginAttempts: user.failedLoginAttempts,
      updatedAt: user.updatedAt
    }

    return {
      message: 'User updated successfully',
      user: userData,
      updatedBy: adminEmail,
      updatedAt: new Date(),
      reason
    }
  }
}
