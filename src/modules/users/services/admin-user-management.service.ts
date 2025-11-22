import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AuditAction, AuditSeverity } from '@modules/audit/entities/audit-log.entity'
import { AuditService } from '@modules/audit/services/audit.service'

import { RoleRepository } from '@core/database/repositories/role.repository'
import { UserRepository } from '@core/database/repositories/user.repository'

import {
  AdminUpdateUserDto,
  AdminUpdateUserResponseDto,
  UpdatedUserDataDto
} from '../dto/admin-update-user.dto'
import { User } from '../entities/user.entity'

/**
 * Admin User Management Service
 *
 * Handles administrative user management operations:
 * - Update any user field including sensitive fields
 * - Change user roles and permissions
 * - Activate/deactivate accounts
 * - Lock/unlock accounts
 * - Full audit trail for all changes
 *
 * All operations are super-admin only and logged for security compliance.
 */
@Injectable()
export class AdminUserManagementService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly auditService: AuditService,
    @InjectPinoLogger(AdminUserManagementService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Update user by super-admin
   *
   * Allows super-admin to modify any user field including:
   * - Personal information (name, email, mobile)
   * - Account status (isActive, isVerified, isLocked)
   * - Role assignment (primaryRoleId)
   * - Security settings (forcePasswordChange, failedLoginAttempts)
   *
   * @param userId - Target user ID to update
   * @param dto - Update data
   * @param adminId - Super-admin performing the update
   * @param adminEmail - Super-admin email for audit trail
   * @returns Updated user data with metadata
   * @throws NotFoundException if user not found
   * @throws BadRequestException if role not found or invalid data
   * @throws ConflictException if email/mobile already exists
   */
  async updateUser(
    userId: string,
    dto: AdminUpdateUserDto,
    adminId: string,
    adminEmail: string
  ): Promise<AdminUpdateUserResponseDto> {
    // Find target user
    const user = await this.userRepository.findById(userId, { bypassCache: true })
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    // Store original values for audit trail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalValues: Record<string, any> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newValues: Record<string, any> = {}
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

    // Check for email uniqueness
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(dto.email)
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException(`Email ${dto.email} is already in use`)
      }
      originalValues.email = user.email
      newValues.email = dto.email
      changes.push(`email changed from ${user.email} to ${dto.email}`)
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

    // If no changes, return early
    if (changes.length === 0) {
      this.logger.info(
        {
          userId,
          adminId,
          action: 'admin_update_user_no_changes'
        },
        'No changes to update'
      )
      return this.buildResponse(user, adminEmail, dto.reason)
    }

    // Apply updates
    const updateData: Partial<User> = {}
    if (dto.name !== undefined) updateData.name = dto.name
    if (dto.email !== undefined) updateData.email = dto.email
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
      } else {
        updateData.lockedAt = null
        updateData.lockedUntil = null
        updateData.lockReason = null
      }
    }
    if (dto.failedLoginAttempts !== undefined)
      updateData.failedLoginAttempts = dto.failedLoginAttempts

    // Perform update
    const updatedUser = await this.userRepository.update(userId, updateData)
    if (!updatedUser) {
      throw new BadRequestException('Failed to update user')
    }

    // Log with PinoLogger
    this.logger.warn(
      {
        action: 'admin_update_user',
        userId,
        userEmail: user.email,
        adminId,
        adminEmail,
        changes,
        reason: dto.reason || 'No reason provided'
      },
      `Super-admin ${adminEmail} updated user ${user.email}`
    )

    // Audit log
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

  /**
   * Build standardized response
   */
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
