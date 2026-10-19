import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { EmailQueueService } from '@infrastructure/email'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { EventBus } from '@core/events'
import { PasswordHasher } from '@core/security'

import {
  AdminPasswordResetResponseDto,
  AdminResetPasswordDto,
  AdminSetPasswordDto
} from '../dto/admin-password-management.dto'
import { UserCredentialsResetEvent } from '../events/user-credentials-reset.event'
import { UserRepository } from '../repositories/user.repository'

/**
 * Admin Password Management Service
 *
 * Handles administrative password operations with security best practices:
 * - System-generated secure passwords
 * - Admin-defined passwords (with validation)
 * - Force password change on next login
 * - Complete audit trail
 * - Session invalidation
 * - Optional email notifications
 */
@Injectable()
export class AdminPasswordManagementService {
  constructor(
    private readonly passwordHasher: PasswordHasher,
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus,
    private readonly emailQueueService: EmailQueueService,
    @InjectPinoLogger(AdminPasswordManagementService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Generate a secure random password
   *
   * Pattern: 4 uppercase + 4 lowercase + 2 digits + 2 special chars = 12 chars
   * Shuffled for randomness
   */
  private generateSecurePassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const lowercase = 'abcdefghijklmnopqrstuvwxyz'
    const numbers = '0123456789'
    const special = '@$!%*?&'

    const getRandomChars = (str: string, count: number): string => {
      let result = ''
      for (let i = 0; i < count; i++) {
        result += str.charAt(Math.floor(Math.random() * str.length))
      }
      return result
    }

    // Generate password parts
    const parts = [
      getRandomChars(uppercase, 4),
      getRandomChars(lowercase, 4),
      getRandomChars(numbers, 2),
      getRandomChars(special, 2)
    ]

    // Shuffle all characters
    const password = parts
      .join('')
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('')

    return password
  }

  /**
   * Admin resets user password (system-generated)
   *
   * Use Case: User forgot password, emergency access
   * Returns temporary password to admin
   */
  async resetPassword(
    dto: AdminResetPasswordDto,
    adminId: string,
    adminEmail: string
  ): Promise<AdminPasswordResetResponseDto> {
    const { userId, forcePasswordChange = true, reason } = dto

    // Find user
    const user = await this.userRepository.findById(userId, { bypassCache: true })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (!user.isActive) {
      throw new BadRequestException('Cannot reset password for inactive user')
    }

    // Generate secure random password
    const temporaryPassword = this.generateSecurePassword()

    // Hash password
    const passwordHash = await this.passwordHasher.hash(temporaryPassword)

    // Update user
    await this.userRepository.update(userId, { passwordHash, forcePasswordChange })

    // Invalidate all user sessions (force re-login); fails the request if revocation fails
    await this.eventBus.publish(
      new UserCredentialsResetEvent(userId, adminId, `Password reset by admin: ${adminEmail}`)
    )

    this.logger.warn(
      {
        userId: user.id,
        userEmail: user.email,
        adminId,
        adminEmail,
        reason,
        sessionsRevoked: true,
        forcePasswordChange,
        action: 'admin_password_reset'
      },
      'Admin reset user password (system-generated)'
    )

    // Optional: Send email notification to user
    // (Disabled by default for security - admin should communicate directly)

    return {
      userId: user.id,
      email: user.email,
      temporaryPassword, // Only returned in reset (system-generated)
      forcePasswordChange,
      changedBy: adminEmail,
      changedAt: new Date(),
      reason
    }
  }

  /**
   * Admin sets specific password for user
   *
   * Use Case: Emergency access, specific requirements
   * Admin defines the password (still validated)
   */
  async setPassword(
    dto: AdminSetPasswordDto,
    adminId: string,
    adminEmail: string
  ): Promise<AdminPasswordResetResponseDto> {
    const {
      userId,
      newPassword,
      forcePasswordChange = true,
      reason,
      sendNotification = false
    } = dto

    // Find user
    const user = await this.userRepository.findById(userId, { bypassCache: true })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (!user.isActive) {
      throw new BadRequestException('Cannot set password for inactive user')
    }

    // Prevent admin from setting password for another super admin
    // (Optional security measure - uncomment if needed)
    // if (user.hasRole('Super Admin') && user.id !== adminId) {
    //   throw new BadRequestException('Cannot set password for another super admin')
    // }

    // Hash password
    const passwordHash = await this.passwordHasher.hash(newPassword)

    // Update user
    await this.userRepository.update(userId, { passwordHash, forcePasswordChange })

    // Invalidate all user sessions (force re-login); fails the request if revocation fails
    await this.eventBus.publish(
      new UserCredentialsResetEvent(userId, adminId, `Password set by admin: ${adminEmail}`)
    )

    this.logger.warn(
      {
        userId: user.id,
        userEmail: user.email,
        adminId,
        adminEmail,
        reason,
        sessionsRevoked: true,
        forcePasswordChange,
        sendNotification,
        action: 'admin_password_set'
      },
      'Admin set user password (admin-defined)'
    )

    // Send notification email if requested
    if (sendNotification) {
      await this.emailQueueService.sendPasswordChangedEmail({
        to: user.email,
        firstName: user.name.split(' ')[0] || 'User',
        resetTime: new Date().toISOString(),
        resetIpAddress: 'Admin Action'
      })

      this.logger.info(
        { userId: user.id, userEmail: user.email },
        'Password change notification email sent'
      )
    }

    return {
      userId: user.id,
      email: user.email,
      // No temporaryPassword in response (admin set it, they know it)
      forcePasswordChange,
      changedBy: adminEmail,
      changedAt: new Date(),
      reason
    }
  }
}
