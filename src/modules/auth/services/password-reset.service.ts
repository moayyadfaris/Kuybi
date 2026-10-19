import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailQueueService } from '@infrastructure/email'
import { randomUUID } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { EntityManager, LessThan } from 'typeorm'

import { UserRepository } from '@modules/users'
import { User } from '@modules/users/entities'

import { PasswordHasher } from '@core/security'

import {
  ForgotPasswordDto,
  ResetPasswordDto,
  ValidateResetTokenDto
} from '../dto/password-reset.dto'
import { PasswordReset } from '../entities/password-reset.entity'
import { PasswordResetRepository } from '../repositories/password-reset.repository'

import { PasswordPolicyService } from './password-policy.service'
import { SessionsService } from './sessions.service'

/**
 * Password Reset Service
 *
 * Handles secure password reset flow including:
 * - Token generation and validation
 * - Password updates with session invalidation
 * - Email notifications
 * - Security audit trail
 */
@Injectable()
export class PasswordResetService {
  private readonly resetTokenExpiry: number
  private readonly appUrl: string

  constructor(
    private readonly passwordHasher: PasswordHasher,
    private readonly userRepository: UserRepository,
    private readonly passwordResetRepository: PasswordResetRepository,
    private readonly emailQueueService: EmailQueueService,
    private readonly sessionsService: SessionsService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly configService: ConfigService,
    @InjectPinoLogger(PasswordResetService.name)
    private readonly logger: PinoLogger
  ) {
    // 1 hour in milliseconds (shorter than email verification for security)
    this.resetTokenExpiry = 60 * 60 * 1000
    this.appUrl = this.configService.get<string>('app.url', 'http://localhost:4040')
  }

  /**
   * Request a password reset
   *
   * Security: Always returns success even if email doesn't exist
   * to prevent email enumeration attacks
   */
  async requestPasswordReset(
    dto: ForgotPasswordDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ message: string }> {
    const { email } = dto

    // Find user by email
    const user = await this.userRepository.findByEmail(email.trim(), true)

    // Always return success message to prevent email enumeration
    const successMessage = 'If the email exists in our system, a password reset link has been sent.'

    // If user doesn't exist, return success anyway (security)
    if (!user) {
      this.logger.warn(
        { email, ipAddress, action: 'password_reset_request_unknown_email' },
        'Password reset requested for non-existent email'
      )
      return { message: successMessage }
    }

    // If user is not active, still return success (security)
    if (!user.isActive) {
      this.logger.warn(
        { userId: user.id, email, ipAddress, action: 'password_reset_request_inactive_user' },
        'Password reset requested for inactive user'
      )
      return { message: successMessage }
    }

    // Generate new reset token
    const resetToken = randomUUID()
    const expiresAt = new Date(Date.now() + this.resetTokenExpiry)
    const resetLink = `${this.appUrl}/reset-password?token=${resetToken}`

    // Old tokens expire, the new one is stored and its email queued, all or nothing
    await this.passwordResetRepository.transaction(async manager => {
      await this.invalidateUserResetTokens(user.id, manager)
      await manager.save(
        manager.create(PasswordReset, {
          userId: user.id,
          email: user.email,
          token: resetToken,
          expiresAt,
          used: false,
          usedAt: null,
          requestIpAddress: ipAddress,
          userAgent
        })
      )
      await this.emailQueueService.sendPasswordResetEmail(
        {
          to: user.email,
          firstName: user.name.split(' ')[0] || 'User',
          resetLink,
          resetToken,
          expiresInMinutes: 60
        },
        { manager }
      )
    })

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        ipAddress,
        expiresAt,
        action: 'password_reset_requested'
      },
      'Password reset requested successfully'
    )

    return { message: successMessage }
  }

  /**
   * Validate a reset token
   *
   * Optional endpoint for frontend to check token validity before showing form
   */
  async validateResetToken(dto: ValidateResetTokenDto): Promise<{
    valid: boolean
    email?: string
    expiresAt?: Date
  }> {
    const { token } = dto

    const resetRecord = await this.passwordResetRepository.findByToken(token)

    if (!resetRecord) {
      return { valid: false }
    }

    if (resetRecord.isExpired()) {
      return { valid: false }
    }

    if (resetRecord.used) {
      return { valid: false }
    }

    // Check if user still exists and is active
    if (!resetRecord.user || !resetRecord.user.isActive) {
      return { valid: false }
    }

    return {
      valid: true,
      email: resetRecord.email,
      expiresAt: resetRecord.expiresAt
    }
  }

  /**
   * Reset password with valid token
   *
   * - Validates token
   * - Updates password
   * - Marks token as used
   * - Invalidates all user sessions (force re-login)
   * - Sends confirmation email
   */
  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string
  ): Promise<{ message: string; email: string }> {
    const { token, newPassword } = dto

    // Find reset record with user relation
    const resetRecord = await this.passwordResetRepository.findByToken(token)

    if (!resetRecord) {
      throw new BadRequestException('Invalid or expired reset token')
    }

    if (resetRecord.isExpired()) {
      throw new BadRequestException('Reset token has expired')
    }

    if (resetRecord.used) {
      throw new BadRequestException('Reset token has already been used')
    }

    if (!resetRecord.user || !resetRecord.user.isActive) {
      throw new NotFoundException('User not found or inactive')
    }

    const user = resetRecord.user

    // Same rules as a password change: strong enough, not the current or a recent one.
    // Without this, "forgot password" was a way around the reuse policy.
    const currentHash = await this.userRepository.findPasswordHash(user.id)
    await this.passwordPolicy.assertAcceptable(user.id, newPassword, currentHash ?? undefined)

    // Hash new password
    const passwordHash = await this.passwordHasher.hash(newPassword)

    // Writes the user's password hash: run through UserRepository so the cached user is
    // dropped once the reset commits
    await this.userRepository.transaction(async manager => {
      // Claim the token atomically: of two concurrent requests with the same token only
      // one may succeed (checking `used` above and saving later let both through)
      const claim = await manager.update(
        PasswordReset,
        { id: resetRecord.id, used: false },
        { used: true, usedAt: new Date(), resetIpAddress: ipAddress ?? null }
      )
      if (!claim.affected) {
        throw new BadRequestException('Reset token has already been used')
      }

      await manager.update(User, user.id, { passwordHash })

      await this.emailQueueService.sendPasswordChangedEmail(
        {
          to: user.email,
          firstName: user.name.split(' ')[0] || 'User',
          resetTime: new Date().toISOString(),
          resetIpAddress: ipAddress || 'Unknown'
        },
        { manager }
      )
    })

    await this.passwordPolicy.record(user.id, passwordHash, { ipAddress }, currentHash ?? undefined)

    // Invalidate ALL user sessions (force re-login everywhere)
    const revokedCount = await this.sessionsService.revokeAllSessions(
      user.id,
      undefined,
      'Password reset'
    )

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        ipAddress,
        revokedSessions: revokedCount,
        action: 'password_reset_completed'
      },
      'Password reset completed successfully'
    )

    return {
      message: 'Password has been reset successfully. You can now log in with your new password.',
      email: user.email
    }
  }

  /**
   * Invalidate all existing reset tokens for a user
   *
   * Used when:
   * - New reset request is made
   * - User successfully resets password
   */
  private async invalidateUserResetTokens(userId: string, manager: EntityManager): Promise<void> {
    // Mark all unused tokens as expired by setting expiresAt to now
    const now = new Date()

    await manager.update(
      PasswordReset,
      {
        userId,
        used: false,
        expiresAt: LessThan(new Date(Date.now() + this.resetTokenExpiry)) // Not yet expired
      },
      {
        expiresAt: now // Expire immediately
      }
    )

    this.logger.debug(
      { userId, action: 'invalidate_reset_tokens' },
      'Invalidated existing reset tokens for user'
    )
  }

  /**
   * Cleanup expired reset tokens (optional background job)
   *
   * Can be called by a cron job to keep table clean
   */
  async cleanupExpiredTokens(olderThanDays = 7): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const deleted = await this.passwordResetRepository.deleteExpiredBefore(cutoffDate)

    this.logger.info(
      { deleted, olderThanDays, action: 'cleanup_expired_reset_tokens' },
      'Cleaned up expired reset tokens'
    )

    return deleted
  }
}
