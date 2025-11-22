import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { EmailQueueService } from '@infrastructure/email'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { LessThan, Repository } from 'typeorm'

import { User } from '@modules/users/entities/user.entity'

import {
  ForgotPasswordDto,
  ResetPasswordDto,
  ValidateResetTokenDto
} from '../dto/password-reset.dto'
import { PasswordReset } from '../entities/password-reset.entity'

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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
    private readonly emailQueueService: EmailQueueService,
    private readonly sessionsService: SessionsService,
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
    const user = await this.userRepository.findOne({
      where: { email }
    })

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

    // Invalidate all existing reset tokens for this user
    await this.invalidateUserResetTokens(user.id)

    // Generate new reset token
    const resetToken = randomUUID()
    const expiresAt = new Date(Date.now() + this.resetTokenExpiry)

    // Store reset token in database
    const passwordResetRecord = this.passwordResetRepository.create({
      userId: user.id,
      email: user.email,
      token: resetToken,
      expiresAt,
      used: false,
      usedAt: null,
      requestIpAddress: ipAddress,
      userAgent
    })

    await this.passwordResetRepository.save(passwordResetRecord)

    // Queue password reset email
    const resetLink = `${this.appUrl}/reset-password?token=${resetToken}`

    await this.emailQueueService.sendPasswordResetEmail({
      to: user.email,
      firstName: user.name.split(' ')[0] || 'User',
      resetLink,
      resetToken,
      expiresInMinutes: 60
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

    const resetRecord = await this.passwordResetRepository.findOne({
      where: { token },
      relations: ['user']
    })

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
    const resetRecord = await this.passwordResetRepository.findOne({
      where: { token },
      relations: ['user']
    })

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

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(newPassword, salt)

    // Update user password
    user.passwordHash = passwordHash
    await this.userRepository.save(user)

    // Mark reset token as used
    resetRecord.used = true
    resetRecord.usedAt = new Date()
    resetRecord.resetIpAddress = ipAddress
    await this.passwordResetRepository.save(resetRecord)

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

    // Send confirmation email
    await this.emailQueueService.sendPasswordChangedEmail({
      to: user.email,
      firstName: user.name.split(' ')[0] || 'User',
      resetTime: new Date().toLocaleString(),
      resetIpAddress: ipAddress || 'Unknown'
    })

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
  private async invalidateUserResetTokens(userId: string): Promise<void> {
    // Mark all unused tokens as expired by setting expiresAt to now
    const now = new Date()

    await this.passwordResetRepository.update(
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

    const result = await this.passwordResetRepository.delete({
      expiresAt: LessThan(cutoffDate)
    })

    const deleted = result.affected || 0

    this.logger.info(
      { deleted, olderThanDays, action: 'cleanup_expired_reset_tokens' },
      'Cleaned up expired reset tokens'
    )

    return deleted
  }
}
