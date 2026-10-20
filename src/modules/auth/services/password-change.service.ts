import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailQueueService } from '@infrastructure/email'
import { ErrorCode } from '@shared/errors'
import { errorMessage } from '@shared/utils/error.util'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { UsersService } from '@modules/users'
import { User } from '@modules/users/entities'

import { PasswordHasher } from '@core/security'
import { SentryService } from '@core/sentry'

import { PasswordHistoryRepository } from '../repositories/password-history.repository'
import type { SessionContext } from '../types/session-context'

import { PasswordPolicyService } from './password-policy.service'
import { SessionsService } from './sessions.service'

/**
 * Self-service password change: checks the current password, applies the password
 * policy (strength, history) and a cooldown between changes, stores the new hash, ends
 * the other sessions and tells the account owner by email.
 */
@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly passwordHasher: PasswordHasher,
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
   * The notification email is always sent: it is how the owner learns that someone with
   * access to their account changed the password (`sendNotificationEmail` is ignored).
   * Other sessions end unless `invalidateAllSessions` is false; `currentSessionId` is kept.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
    options: {
      invalidateAllSessions?: boolean
      /** @deprecated ignored: the owner is always notified */
      sendNotificationEmail?: boolean
      /** The session making the change, kept when the others are revoked */
      currentSessionId?: string
    },
    context: SessionContext
  ) {
    if (newPassword !== confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match')
    }

    const user = await this.usersService.findById(userId)
    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    const currentHash = await this.usersService.getPasswordHash(userId)
    if (!(await this.passwordHasher.verify(currentPassword, currentHash))) {
      // 400, not 401: the caller is authenticated, and clients treat 401 as "log out"
      throw new BadRequestException('Current password is incorrect')
    }
    if (await this.passwordHasher.verify(newPassword, currentHash)) {
      throw new BadRequestException('New password must be different from current password')
    }

    await this.passwordPolicy.assertAcceptable(userId, newPassword, currentHash)
    // A change an admin required (forcePasswordChange) must not wait out the cooldown
    if (!user.forcePasswordChange) {
      await this.assertCooldownOver(userId)
    }

    const passwordHash = await this.passwordHasher.hash(newPassword)
    await this.usersService.updateUser(user.id, { passwordHash, forcePasswordChange: false })
    await this.passwordPolicy.record(userId, passwordHash, context, currentHash)

    const invalidateAllSessions = options.invalidateAllSessions !== false
    const sessionsRevoked = invalidateAllSessions
      ? await this.sessionsService.revokeAllSessions(
          userId,
          options.currentSessionId,
          'Password changed by user'
        )
      : 0

    this.logger.info(
      {
        userId,
        ipAddress: context.ipAddress,
        sessionsRevoked,
        keptCurrentSession: !!options.currentSessionId,
        action: 'password_changed'
      },
      'User changed password'
    )

    await this.notifyOwner(user, context)

    return {
      message: invalidateAllSessions
        ? options.currentSessionId
          ? 'Password changed successfully. Other sessions have been logged out.'
          : 'Password changed successfully. Please login with your new password.'
        : 'Password changed successfully. All sessions remain active.',
      sessionsRevoked,
      notificationSent: true
    }
  }

  /** 429 with the time left when the last change is more recent than the cooldown */
  private async assertCooldownOver(userId: string): Promise<void> {
    const cooldownHours = this.configService.get<number>('auth.passwordChangeCooldownHours', 1)
    if (cooldownHours <= 0) return

    const [latestChange] = await this.passwordHistoryRepository.findByUser(userId, 1)
    if (!latestChange) return

    const lastChangedAt = new Date(latestChange.createdAt)
    const hoursSinceChange = (Date.now() - lastChangedAt.getTime()) / (60 * 60 * 1000)
    if (hoursSinceChange >= cooldownHours) return

    const remainingHours = Math.ceil(cooldownHours - hoursSinceChange)
    const remainingMinutes = Math.ceil((cooldownHours - hoursSinceChange) * 60)
    throw new HttpException(
      {
        message: 'Password was changed too recently',
        code: ErrorCode.PASSWORD_CHANGE_COOLDOWN,
        cooldownHours,
        remainingTime:
          remainingHours >= 1
            ? `${remainingHours} hour${remainingHours > 1 ? 's' : ''}`
            : `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`,
        lastChangedAt,
        canChangeAfter: new Date(lastChangedAt.getTime() + cooldownHours * 60 * 60 * 1000)
      },
      HttpStatus.TOO_MANY_REQUESTS
    )
  }

  /** Queued, not sent inline; a failure is reported but does not undo the change */
  private async notifyOwner(user: User, context: SessionContext): Promise<void> {
    try {
      await this.emailQueueService.sendPasswordChangedEmail({
        to: user.email,
        firstName: user.name,
        resetTime: new Date().toISOString(),
        resetIpAddress: context.ipAddress ?? 'Unknown'
      })
    } catch (error) {
      this.logger.error(
        { userId: user.id, error: errorMessage(error) },
        'Failed to queue the password change notification'
      )
      this.sentryService.captureException(error, {
        userId: user.id,
        context: 'password_change_notification'
      })
    }
  }
}
