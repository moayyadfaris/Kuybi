import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailQueueService } from '@infrastructure/email'
import { errorMessage } from '@shared/utils/error.util'
import * as bcrypt from 'bcrypt'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { UsersService } from '@modules/users'

import { SentryService } from '@core/sentry'

import { PasswordHistoryRepository } from '../repositories/password-history.repository'
import type { SessionContext } from '../types/session-context'

import { PasswordPolicyService } from './password-policy.service'
import { SessionsService } from './sessions.service'

/** Self-service password change: verification, policy checks, history and session revocation */
@Injectable()
export class PasswordChangeService {
  constructor(
    @InjectPinoLogger(PasswordChangeService.name)
    private readonly logger: PinoLogger,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
    private readonly passwordHistoryRepository: PasswordHistoryRepository,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly emailQueueService: EmailQueueService,
    private readonly sentryService: SentryService
  ) {}

  /**
   * Change password for user
   * Validates current password, sets new password, and optionally invalidates sessions
   *
   * @param userId - User ID
   * @param currentPassword - Current password for verification
   * @param newPassword - New password to set
   * @param confirmPassword - Password confirmation
   * @param options - Additional options for password change behavior
   * @param context - Session context (IP, user agent, etc.)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
    options: {
      invalidateAllSessions?: boolean
      sendNotificationEmail?: boolean
      currentSessionId?: string // To keep current session active
    },
    context: SessionContext
  ) {
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match')
    }

    // Get user
    const user = await this.usersService.findById(userId)
    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    // Verify current password
    const currentHash = await this.usersService.getPasswordHash(userId)
    const passwordValid = !!currentHash && (await bcrypt.compare(currentPassword, currentHash))
    if (!passwordValid) {
      // 400, not 401: the caller is authenticated, and clients treat 401 as "log out"
      throw new BadRequestException('Current password is incorrect')
    }

    // Prevent reusing the same password
    const samePassword = await bcrypt.compare(newPassword, currentHash)
    if (samePassword) {
      throw new BadRequestException('New password must be different from current password')
    }

    await this.passwordPolicy.assertAcceptable(userId, newPassword, currentHash)

    // Check password change cooldown (temporary lockout)
    const cooldownHours = this.configService.get<number>('auth.passwordChangeCooldownHours', 1)
    if (cooldownHours > 0) {
      const latestChange = await this.passwordHistoryRepository.findByUser(userId, 1)
      if (latestChange.length > 0) {
        const lastChangeDate = latestChange[0].createdAt
        const hoursSinceChange =
          (Date.now() - new Date(lastChangeDate).getTime()) / (1000 * 60 * 60)

        if (hoursSinceChange < cooldownHours) {
          const remainingHours = Math.ceil(cooldownHours - hoursSinceChange)
          const remainingMinutes = Math.ceil((cooldownHours - hoursSinceChange) * 60)

          throw new HttpException(
            {
              message: 'Password was changed too recently',
              code: 'PASSWORD_CHANGE_COOLDOWN',
              cooldownHours,
              remainingTime:
                remainingHours >= 1
                  ? `${remainingHours} hour${remainingHours > 1 ? 's' : ''}`
                  : `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`,
              lastChangedAt: lastChangeDate,
              canChangeAfter: new Date(
                new Date(lastChangeDate).getTime() + cooldownHours * 60 * 60 * 1000
              )
            },
            HttpStatus.TOO_MANY_REQUESTS
          )
        }

        this.logger.info(
          {
            userId,
            hoursSinceChange: hoursSinceChange.toFixed(2),
            cooldownHours,
            action: 'password_cooldown_check_passed'
          },
          'Password change cooldown check passed'
        )
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(newPassword, salt)

    // Update user password and clear forcePasswordChange flag
    user.passwordHash = passwordHash
    user.forcePasswordChange = false
    await this.usersService.updateUser(user.id, {
      passwordHash,
      forcePasswordChange: false
    })

    // Save password to history
    await this.passwordPolicy.record(userId, passwordHash, context, currentHash)

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        ipAddress: context.ipAddress,
        action: 'password_changed',
        invalidateAllSessions: options.invalidateAllSessions,
        sendNotification: options.sendNotificationEmail
      },
      'User changed password successfully'
    )

    // Handle session invalidation based on user preference
    const invalidateAllSessions = options.invalidateAllSessions !== false // Default to true
    const sessionsRevoked = {
      count: 0,
      exceptCurrent: false
    }

    if (invalidateAllSessions) {
      // Invalidate all sessions EXCEPT current one (if provided)
      const revokedCount = await this.sessionsService.revokeAllSessions(
        userId,
        options.currentSessionId, // Exempt current session
        'Password changed by user'
      )

      sessionsRevoked.count = revokedCount
      sessionsRevoked.exceptCurrent = !!options.currentSessionId

      this.logger.info(
        {
          userId: user.id,
          sessionsRevoked: revokedCount,
          exceptCurrent: sessionsRevoked.exceptCurrent,
          action: 'sessions_revoked_after_password_change'
        },
        `Revoked ${revokedCount} sessions after password change`
      )
    } else {
      this.logger.info(
        { userId: user.id, action: 'password_changed_sessions_kept' },
        'Password changed, sessions kept active per user request'
      )
    }

    // Send notification email if requested
    if (options.sendNotificationEmail !== false) {
      try {
        // Queued, not sent inline: SMTP must not slow down or fail the request
        await this.emailQueueService.sendPasswordChangedEmail({
          to: user.email,
          firstName: user.name,
          resetTime: new Date().toISOString(),
          resetIpAddress: context.ipAddress ?? 'Unknown'
        })

        this.logger.info(
          {
            userId: user.id,
            email: user.email,
            action: 'password_change_notification_sent',
            sessionsRevoked: sessionsRevoked.count
          },
          'Password change notification email sent successfully'
        )
      } catch (error) {
        // Log error but don't fail the password change
        this.logger.error(
          {
            userId: user.id,
            email: user.email,
            error: errorMessage(error),
            action: 'password_change_notification_failed'
          },
          'Failed to send password change notification email'
        )

        // Capture to Sentry for monitoring
        this.sentryService.captureException(error, {
          userId: user.id,
          email: user.email,
          context: 'password_change_notification'
        })
      }
    }

    return {
      message: invalidateAllSessions
        ? sessionsRevoked.exceptCurrent
          ? 'Password changed successfully. Other sessions have been logged out.'
          : 'Password changed successfully. Please login with your new password.'
        : 'Password changed successfully. All sessions remain active.',
      success: true,
      sessionsRevoked: sessionsRevoked.count,
      notificationSent: options.sendNotificationEmail !== false
    }
  }
}
