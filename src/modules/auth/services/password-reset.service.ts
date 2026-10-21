import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailQueueService } from '@infrastructure/email'
import { randomUUID } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { EntityManager, MoreThan } from 'typeorm'

import { UserRepository } from '@modules/users'
import { User } from '@modules/users/entities'

import { hashTokenSecret, PasswordHasher } from '@core/security'

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
 * "Forgot password": a single-use link (valid 1 hour) is emailed; using it sets a new
 * password that must pass the same policy as a password change, and ends every session.
 *
 * Tokens are stored hashed. Requests never reveal whether an email is registered.
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
    // Shorter than email verification: a reset link is a password
    this.resetTokenExpiry = 60 * 60 * 1000
    this.appUrl = this.configService.getOrThrow<string>('app.publicUrl')
  }

  /**
   * Emails a reset link. Answers the same whether or not the email is registered (or
   * active), so the endpoint cannot be used to find accounts.
   */
  async requestPasswordReset(
    dto: ForgotPasswordDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ message: string }> {
    const { email } = dto

    const user = await this.userRepository.findByEmail(email.trim(), true)
    const successMessage = 'If the email exists in our system, a password reset link has been sent.'

    // The submitted address is not logged: it is personal data, often someone else's
    if (!user) {
      this.logger.warn(
        { ipAddress, action: 'password_reset_request_unknown_email' },
        'Password reset requested for an unknown email'
      )
      return { message: successMessage }
    }
    if (!user.isActive) {
      this.logger.warn(
        { userId: user.id, ipAddress, action: 'password_reset_request_inactive_user' },
        'Password reset requested for inactive user'
      )
      return { message: successMessage }
    }

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
          token: hashTokenSecret(resetToken),
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
      { userId: user.id, ipAddress, expiresAt, action: 'password_reset_requested' },
      'Password reset requested successfully'
    )

    return { message: successMessage }
  }

  /** Lets the frontend check a link before showing the new-password form */
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
   * Sets the new password: claims the token (single use, even under concurrent requests),
   * stores the hash, records it in the history, ends every session and emails the user
   */
  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string
  ): Promise<{ message: string; email: string }> {
    const { token, newPassword } = dto

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

    const passwordHash = await this.passwordHasher.hash(newPassword)

    // All or nothing: the token claim, the new hash, its history entry, the end of every
    // old session and the notification email commit together, so a failure leaves the
    // old password working and the link usable. Run through UserRepository so the cached
    // user is dropped once the reset commits; the session cache right after.
    const revokedCount = await this.userRepository.transaction(async manager => {
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

      // Ends every earlier access token and session, whatever happens to the revocation
      await manager.update(User, user.id, {
        passwordHash,
        credentialsChangedAt: new Date(),
        credentialsVersion: () => '"credentialsVersion" + 1'
      })

      await this.emailQueueService.sendPasswordChangedEmail(
        {
          to: user.email,
          firstName: user.name.split(' ')[0] || 'User',
          resetTime: new Date().toISOString(),
          resetIpAddress: ipAddress || 'Unknown'
        },
        { manager }
      )

      await this.passwordPolicy.record(
        user.id,
        passwordHash,
        { ipAddress },
        currentHash ?? undefined,
        manager
      )
      // Whoever had the old password may hold a session: end them all
      return this.sessionsService.revokeAllSessions(user.id, undefined, 'Password reset', manager)
    })
    await this.sessionsService.dropSessionCache()

    this.logger.info(
      {
        userId: user.id,
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

  /** Expires the user's pending links: only the newest one works */
  private async invalidateUserResetTokens(userId: string, manager: EntityManager): Promise<void> {
    await manager.update(
      PasswordReset,
      { userId, used: false, expiresAt: MoreThan(new Date()) },
      { expiresAt: new Date() }
    )
  }

  /** Deletes links that expired more than `olderThanDays` ago (daily job) */
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
