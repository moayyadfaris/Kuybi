import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { EmailQueueService } from '@infrastructure/email'
import { randomInt } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AuditService } from '@modules/audit'
import { AuditAction, AuditSeverity } from '@modules/audit/entities'

import { EventBus } from '@core/events'
import { PasswordHasher } from '@core/security'

import {
  AdminPasswordResetResponseDto,
  AdminResetPasswordDto,
  AdminSetPasswordDto
} from '../dto/admin-password-management.dto'
import { User } from '../entities/user.entity'
import { UserCredentialsResetEvent } from '../events/user-credentials-reset.event'
import { UserRepository } from '../repositories/user.repository'

const CHARACTER_SETS = [
  { chars: 'ABCDEFGHJKLMNPQRSTUVWXYZ', count: 4 },
  { chars: 'abcdefghijkmnopqrstuvwxyz', count: 4 },
  { chars: '23456789', count: 2 },
  { chars: '@$!%*?&', count: 2 }
]

/**
 * Generated temporary password: 12 characters with every class the password rules require.
 * Drawn with crypto.randomInt (Math.random is predictable) and shuffled without bias
 * (Fisher-Yates); look-alike characters (I, l, O, 0, 1) are left out.
 */
export function generateTemporaryPassword(): string {
  const characters = CHARACTER_SETS.flatMap(({ chars, count }) =>
    Array.from({ length: count }, () => chars[randomInt(chars.length)])
  )
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[characters[i], characters[j]] = [characters[j], characters[i]]
  }
  return characters.join('')
}

/**
 * Super-admin password operations (POST /admin/users/reset-password and set-password).
 * Both end the user's sessions (UserCredentialsResetEvent), usually require a password
 * change at the next login, and are audited.
 */
@Injectable()
export class AdminPasswordManagementService {
  constructor(
    private readonly passwordHasher: PasswordHasher,
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus,
    private readonly emailQueueService: EmailQueueService,
    private readonly auditService: AuditService,
    @InjectPinoLogger(AdminPasswordManagementService.name)
    private readonly logger: PinoLogger
  ) {}

  /** Generates a temporary password and returns it to the admin (only time it is shown) */
  async resetPassword(
    dto: AdminResetPasswordDto,
    adminId: string,
    adminEmail: string
  ): Promise<AdminPasswordResetResponseDto> {
    const { userId, forcePasswordChange = true, reason } = dto
    const user = await this.activeUser(userId)
    const temporaryPassword = generateTemporaryPassword()

    await this.replacePassword(user, temporaryPassword, forcePasswordChange, adminId, adminEmail, {
      operation: 'reset',
      reason
    })

    return {
      userId: user.id,
      email: user.email,
      temporaryPassword,
      forcePasswordChange,
      changedBy: adminEmail,
      changedAt: new Date(),
      reason
    }
  }

  /** Sets the password the admin chose; optionally emails the user about the change */
  async setPassword(
    dto: AdminSetPasswordDto,
    adminId: string,
    adminEmail: string
  ): Promise<AdminPasswordResetResponseDto> {
    const { userId, newPassword, forcePasswordChange = true, reason, sendNotification } = dto
    const user = await this.activeUser(userId)

    await this.replacePassword(user, newPassword, forcePasswordChange, adminId, adminEmail, {
      operation: 'set',
      reason
    })

    if (sendNotification) {
      await this.emailQueueService.sendPasswordChangedEmail({
        to: user.email,
        firstName: user.name.split(' ')[0] || 'User',
        resetTime: new Date().toISOString(),
        resetIpAddress: 'Admin Action'
      })
    }

    return {
      userId: user.id,
      email: user.email,
      forcePasswordChange,
      changedBy: adminEmail,
      changedAt: new Date(),
      reason
    }
  }

  private async activeUser(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId, { bypassCache: true })
    if (!user) {
      throw new NotFoundException('User not found')
    }
    if (!user.isActive) {
      throw new BadRequestException('Cannot change the password of an inactive user')
    }
    return user
  }

  /** Stores the hash, ends every session (fails the request if that fails) and audits */
  private async replacePassword(
    user: User,
    password: string,
    forcePasswordChange: boolean,
    adminId: string,
    adminEmail: string,
    details: { operation: 'reset' | 'set'; reason?: string }
  ): Promise<void> {
    const passwordHash = await this.passwordHasher.hash(password)
    // The auth module ends the sessions (UserCredentialsResetEvent) while this transaction
    // is open: if that fails the new password rolls back; if the commit fails after it,
    // the user only has to sign in again
    await this.userRepository.transaction(async manager => {
      await manager.update(User, user.id, {
        passwordHash,
        forcePasswordChange,
        credentialsChangedAt: new Date()
      })
      await this.eventBus.publish(
        new UserCredentialsResetEvent(
          user.id,
          adminId,
          `Password ${details.operation} by admin: ${adminEmail}`
        )
      )
    })

    this.logger.warn(
      {
        userId: user.id,
        adminId,
        forcePasswordChange,
        action: `admin_password_${details.operation}`
      },
      `Super-admin ${details.operation === 'reset' ? 'reset' : 'set'} a user's password`
    )
    await this.auditService.logAction(
      { userId: adminId, email: adminEmail },
      {
        action: AuditAction.RESET_PASSWORD,
        entityType: 'User',
        entityId: user.id,
        severity: AuditSeverity.HIGH,
        description: `Super-admin ${details.operation === 'reset' ? 'reset' : 'set'} the password of ${user.email}`,
        metadata: {
          operation: details.operation,
          targetUserId: user.id,
          forcePasswordChange,
          reason: details.reason
        }
      }
    )
  }
}
