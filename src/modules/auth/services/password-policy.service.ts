import { BadRequestException, Injectable } from '@nestjs/common'
import { ErrorCode } from '@shared/errors'
import { EntityManager } from 'typeorm'

import { PasswordHasher } from '@core/security'

import { PasswordHistoryRepository } from '../repositories/password-history.repository'
import type { SessionContext } from '../types/session-context'

import { PasswordStrengthService } from './password-strength.service'

/** How many previous passwords may not be reused */
export const PASSWORD_HISTORY_DEPTH = 5

/**
 * Rules every new password must meet, whichever flow sets it (self-service change,
 * reset by email link): strength, and not the current or a recent password.
 */
@Injectable()
export class PasswordPolicyService {
  constructor(
    private readonly passwordHasher: PasswordHasher,
    private readonly passwordStrengthService: PasswordStrengthService,
    private readonly passwordHistoryRepository: PasswordHistoryRepository
  ) {}

  /** Throws 400 when the password is too weak or was used recently */
  async assertAcceptable(
    userId: string,
    newPassword: string,
    currentHash?: string | null
  ): Promise<void> {
    const strength = await this.passwordStrengthService.calculateStrength(newPassword)
    if (!strength.passed) {
      throw new BadRequestException({
        code: ErrorCode.PASSWORD_TOO_WEAK,
        message: 'Password does not meet strength requirements',
        details: { feedback: strength.feedback, strength: strength.strength, score: strength.score }
      })
    }

    // The current password is not necessarily in the history (e.g. set at registration)
    const previous = await this.passwordHistoryRepository.findByUser(userId, PASSWORD_HISTORY_DEPTH)
    const hashes = [currentHash, ...previous.map(entry => entry.passwordHash)].filter(
      (hash): hash is string => !!hash
    )
    for (const hash of hashes) {
      if (await this.passwordHasher.verify(newPassword, hash)) {
        throw new BadRequestException({
          code: ErrorCode.PASSWORD_RECENTLY_USED,
          message: 'Password has been used recently. Please choose a different password.'
        })
      }
    }
  }

  /**
   * Records a newly set password so it cannot be reused for the next changes. The
   * password it replaces is recorded first if missing: a registration password never
   * entered the history, so it stayed reusable after the first change.
   */
  async record(
    userId: string,
    passwordHash: string,
    context: SessionContext = {},
    previousHash?: string | null,
    manager?: EntityManager
  ): Promise<void> {
    if (previousHash) {
      const recent = await this.passwordHistoryRepository.findByUser(
        userId,
        PASSWORD_HISTORY_DEPTH,
        manager
      )
      if (!recent.some(entry => entry.passwordHash === previousHash)) {
        await this.passwordHistoryRepository.addPasswordHistory(
          userId,
          previousHash,
          undefined,
          undefined,
          PASSWORD_HISTORY_DEPTH,
          manager
        )
      }
    }
    await this.passwordHistoryRepository.addPasswordHistory(
      userId,
      passwordHash,
      context.ipAddress,
      context.userAgent,
      PASSWORD_HISTORY_DEPTH,
      manager
    )
  }
}
