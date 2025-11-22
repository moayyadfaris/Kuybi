import { Processor } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AccountLockoutService } from '@modules/auth/services/account-lockout.service'

import {
  AccountSecurityJobType,
  CheckExpiredLocksJobData,
  QueueName,
  ResetFailedAttemptsJobData,
  UnlockAccountJobData
} from '../jobs/types'

import { BaseProcessor } from './base.processor'

/**
 * Account Security Queue Processor
 * Handles automated account lockout/unlock operations
 */
@Processor(QueueName.ACCOUNT_SECURITY)
export class AccountSecurityProcessor extends BaseProcessor {
  constructor(
    @InjectPinoLogger(AccountSecurityProcessor.name)
    logger: PinoLogger,
    private readonly accountLockoutService: AccountLockoutService
  ) {
    super(logger)
  }

  async process(job: Job): Promise<Record<string, unknown>> {
    const { name, data, id } = job

    this.logger.info({ jobId: id, jobName: name, data }, 'Processing account security job')

    try {
      switch (name) {
        case AccountSecurityJobType.UNLOCK_ACCOUNT:
          return await this.handleUnlockAccount(job.data as UnlockAccountJobData)

        case AccountSecurityJobType.RESET_FAILED_ATTEMPTS:
          return await this.handleResetFailedAttempts(job.data as ResetFailedAttemptsJobData)

        case AccountSecurityJobType.CHECK_EXPIRED_LOCKS:
          return await this.handleCheckExpiredLocks(job.data as CheckExpiredLocksJobData)

        default:
          this.logger.warn({ jobName: name }, 'Unknown job type')
          return { success: false, error: 'Unknown job type' }
      }
    } catch (error) {
      this.logger.error(
        { jobId: id, jobName: name, error: error.message, stack: error.stack },
        'Account security job failed'
      )
      throw error
    }
  }

  /**
   * Handle automatic account unlock
   */
  private async handleUnlockAccount(data: UnlockAccountJobData): Promise<Record<string, unknown>> {
    const { userId, reason, lockedAt } = data

    this.logger.info({ userId, reason, lockedAt }, 'Unlocking account')

    try {
      await this.accountLockoutService.unlockAccount(userId, reason)

      return {
        success: true,
        userId,
        reason,
        unlockedAt: new Date()
      }
    } catch (error) {
      this.logger.error({ userId, reason, error: error.message }, 'Failed to unlock account')
      throw error
    }
  }

  /**
   * Handle reset of failed login attempts counter
   */
  private async handleResetFailedAttempts(
    data: ResetFailedAttemptsJobData
  ): Promise<Record<string, unknown>> {
    const { userId, lastFailedAttempt } = data

    this.logger.debug({ userId, lastFailedAttempt }, 'Resetting failed attempts counter')

    try {
      // Check if there were no new failed attempts since this job was scheduled
      const lockInfo = await this.accountLockoutService.getAccountLockInfo(userId)

      // Only reset if account is not locked
      if (!lockInfo.isLocked) {
        await this.accountLockoutService.resetFailedAttempts(userId)
        return {
          success: true,
          userId,
          resetAt: new Date()
        }
      }

      return {
        success: false,
        userId,
        reason: 'Account is locked, not resetting attempts'
      }
    } catch (error) {
      this.logger.error({ userId, error: error.message }, 'Failed to reset failed attempts')
      throw error
    }
  }

  /**
   * Handle periodic check for expired locks (cron job)
   */
  private async handleCheckExpiredLocks(
    data: CheckExpiredLocksJobData
  ): Promise<Record<string, unknown>> {
    const { batchSize = 100 } = data

    this.logger.info({ batchSize }, 'Checking for expired account locks')

    try {
      const unlockedCount = await this.accountLockoutService.unlockExpiredAccounts()

      return {
        success: true,
        unlockedCount,
        checkedAt: new Date()
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to check expired locks')
      throw error
    }
  }
}
