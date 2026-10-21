import { InjectQueue, Processor } from '@nestjs/bullmq'
import { errorMessage, errorStack } from '@shared/utils/error.util'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import {
  AccountSecurityJobType,
  CheckExpiredLocksJobData,
  QueueName,
  ResetFailedAttemptsJobData,
  UnlockAccountJobData
} from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { AccountLockoutService } from '../services/account-lockout.service'

/**
 * Account Security Queue Processor
 * Handles automated account lockout/unlock operations
 */
@Processor(QueueName.ACCOUNT_SECURITY)
export class AccountSecurityProcessor extends BaseProcessor {
  constructor(
    @InjectPinoLogger(AccountSecurityProcessor.name)
    logger: PinoLogger,
    private readonly accountLockoutService: AccountLockoutService,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
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
        { jobId: id, jobName: name, error: errorMessage(error), stack: errorStack(error) },
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
      // Only lifts the lock this job was scheduled for, once its time is up
      const unlocked = await this.accountLockoutService.unlockAccount(userId, reason)

      return {
        success: unlocked,
        userId,
        reason,
        unlockedAt: new Date()
      }
    } catch (error) {
      this.logger.error({ userId, reason, error: errorMessage(error) }, 'Failed to unlock account')
      throw error
    }
  }

  /**
   * Handle reset of failed login attempts counter
   */
  private async handleResetFailedAttempts(
    data: ResetFailedAttemptsJobData
  ): Promise<Record<string, unknown>> {
    const { userId, lastFailedAttempt, failedAttempts } = data

    this.logger.debug({ userId, lastFailedAttempt }, 'Resetting failed attempts counter')

    try {
      // Only if no failure came after this reset was scheduled and the account is not
      // locked (one conditional update)
      const reset = await this.accountLockoutService.forgetFailedAttempts(userId, failedAttempts)
      return reset
        ? { success: true, userId, resetAt: new Date() }
        : { success: false, userId, reason: 'Newer failures or locked: attempts kept' }
    } catch (error) {
      this.logger.error({ userId, error: errorMessage(error) }, 'Failed to reset failed attempts')
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
      this.logger.error({ error: errorMessage(error) }, 'Failed to check expired locks')
      throw error
    }
  }
}
