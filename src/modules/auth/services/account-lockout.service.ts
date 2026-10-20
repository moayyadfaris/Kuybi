import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EmailQueueService } from '@infrastructure/email'
import { errorMessage } from '@shared/utils/error.util'
import { Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { UserRepository } from '@modules/users'

import {
  AccountSecurityJobType,
  QueueName,
  ResetFailedAttemptsJobData,
  UnlockAccountJobData
} from '@core/queues/jobs/types'

export interface AccountLockoutConfig {
  enabled: boolean
  /** Failed logins in a row that lock the account */
  maxAttempts: number
  /** How long a lock lasts (milliseconds) */
  lockDuration: number
  /** Failed attempts are forgotten this long after the last one (milliseconds) */
  resetAttemptsPeriod: number
  notifyOnLockout: boolean
  notifyOnUnlock: boolean
}

export interface LockoutInfo {
  isLocked: boolean
  failedAttempts: number
  maxAttempts: number
  lockedAt?: Date
  lockedUntil?: Date
  lockReason?: string
  remainingAttempts: number
}

export enum LockReason {
  FAILED_ATTEMPTS = 'FAILED_ATTEMPTS',
  ADMIN_LOCK = 'ADMIN_LOCK'
}

/**
 * Locks an account after `maxAttempts` failed logins in a row, for `lockDuration`.
 *
 * The counter lives on the user row and is incremented atomically. A delayed job unlocks
 * the account when the lock ends (isAccountLocked() also unlocks an expired lock on the
 * next login); another forgets failed attempts after `resetAttemptsPeriod` of quiet.
 * Admins lock and unlock through the users module (PATCH /admin/users/:id).
 */
@Injectable()
export class AccountLockoutService {
  private readonly config: AccountLockoutConfig

  constructor(
    private readonly userRepository: UserRepository,
    @InjectQueue(QueueName.ACCOUNT_SECURITY)
    private readonly accountSecurityQueue: Queue,
    private readonly configService: ConfigService,
    private readonly emailQueueService: EmailQueueService,
    @InjectPinoLogger(AccountLockoutService.name)
    private readonly logger: PinoLogger
  ) {
    this.config = this.configService.get<AccountLockoutConfig>('security.accountLockout', {
      enabled: true,
      maxAttempts: 5,
      lockDuration: 30 * 60 * 1000,
      resetAttemptsPeriod: 15 * 60 * 1000,
      notifyOnLockout: true,
      notifyOnUnlock: true
    })
  }

  /** Counts a failed login; at the threshold, locks the account */
  async recordFailedAttempt(userId: string, ipAddress?: string): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    // Atomic increment: concurrent failures (a parallel brute force) must all count.
    // Reading the counter and saving it back lost most of them.
    const failedAttempts = await this.userRepository.incrementFailedLoginAttempts(userId)
    if (failedAttempts === null) {
      throw new NotFoundException(`User ${userId} not found`)
    }

    this.logger.info(
      {
        userId,
        failedAttempts,
        maxAttempts: this.config.maxAttempts,
        ipAddress,
        action: 'failed_login_attempt'
      },
      `Failed login attempt ${failedAttempts}/${this.config.maxAttempts}`
    )

    // At or past the threshold (the counter can be past it, e.g. after an unlock that kept
    // it); lockAccount locks once however many requests race here
    if (failedAttempts >= this.config.maxAttempts) {
      await this.lockAccount(userId, failedAttempts)
    } else {
      await this.scheduleResetFailedAttempts(userId)
    }
  }

  /**
   * Locks the account for `lockDuration`, schedules the unlock and emails the user. Only
   * the caller whose conditional update locked it does the last two.
   */
  async lockAccount(userId: string, failedAttempts: number): Promise<void> {
    const lockedAt = new Date()
    const lockedUntil = new Date(lockedAt.getTime() + this.config.lockDuration)

    const locked = await this.userRepository.lockIfUnlocked(userId, {
      lockedAt,
      lockedUntil,
      lockReason: LockReason.FAILED_ATTEMPTS
    })
    if (!locked) return

    this.logger.warn(
      { userId, failedAttempts, lockedAt, lockedUntil, action: 'account_locked' },
      'Account locked after failed logins'
    )

    await this.scheduleUnlock(userId, lockedUntil)

    if (this.config.notifyOnLockout) {
      const user = await this.userRepository.findById(userId, { bypassCache: true })
      if (!user) return
      try {
        // Queued, not sent inline: this runs inside the login request
        await this.emailQueueService.queueAccountLockedEmail({
          to: user.email,
          userName: user.name,
          lockedAt,
          lockedUntil,
          failedAttempts
        })
      } catch (error) {
        // An email failure must not undo the lock
        this.logger.error({ userId, error: errorMessage(error) }, 'Failed to queue lockout email')
      }
    }
  }

  private async scheduleUnlock(userId: string, unlockAt: Date): Promise<void> {
    const delay = unlockAt.getTime() - Date.now()
    if (delay <= 0) {
      await this.unlockAccount(userId, 'AUTO_UNLOCK')
      return
    }

    const jobData: UnlockAccountJobData = {
      userId,
      reason: 'AUTO_UNLOCK',
      lockedAt: new Date(),
      timestamp: new Date().toISOString()
    }
    await this.accountSecurityQueue.add(AccountSecurityJobType.UNLOCK_ACCOUNT, jobData, {
      delay,
      jobId: `unlock-${userId}-${Date.now()}`
    })
    this.logger.info({ userId, unlockAt, delayMs: delay }, 'Scheduled automatic unlock')
  }

  /** (Re)starts the quiet period after which failed attempts are forgotten */
  private async scheduleResetFailedAttempts(userId: string): Promise<void> {
    const jobData: ResetFailedAttemptsJobData = {
      userId,
      lastFailedAttempt: new Date(),
      timestamp: new Date().toISOString()
    }
    // Same job id per user: a newer failure replaces the pending reset
    await this.accountSecurityQueue.add(AccountSecurityJobType.RESET_FAILED_ATTEMPTS, jobData, {
      delay: this.config.resetAttemptsPeriod,
      jobId: `reset-attempts-${userId}`,
      removeOnComplete: true
    })
  }

  /** Unlocks and resets the counter (no-op when not locked); emails the user */
  async unlockAccount(userId: string, reason: 'AUTO_UNLOCK' | 'ADMIN_UNLOCK'): Promise<void> {
    const user = await this.userRepository.findById(userId, { bypassCache: true })
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`)
    }
    if (!user.isLocked) {
      return
    }

    const previousAttempts = user.failedLoginAttempts
    await this.userRepository.update(userId, {
      isLocked: false,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedUntil: null,
      lockReason: null
    })
    this.logger.info({ userId, reason, action: 'account_unlocked' }, `Account unlocked: ${reason}`)

    if (this.config.notifyOnUnlock) {
      try {
        await this.emailQueueService.queueAccountUnlockedEmail({
          to: user.email,
          userName: user.name,
          unlockedAt: new Date(),
          unlockType: reason === 'AUTO_UNLOCK' ? 'automatic' : 'manual',
          previousAttempts
        })
      } catch (error) {
        // An email failure must not undo the unlock
        this.logger.error({ userId, error: errorMessage(error) }, 'Failed to queue unlock email')
      }
    }
  }

  /** Whether the account is locked now; unlocks it on the way if its lock has ended */
  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.userRepository.findLockState(userId)
    if (!user) {
      return false
    }

    if (user.isLocked && user.lockedUntil && user.lockedUntil < new Date()) {
      await this.unlockAccount(userId, 'AUTO_UNLOCK')
      return false
    }
    return user.isLocked
  }

  /** After a successful login */
  async resetFailedAttempts(userId: string): Promise<void> {
    await this.userRepository.update(userId, { failedLoginAttempts: 0 })
  }

  async getAccountLockInfo(userId: string): Promise<LockoutInfo> {
    const user = await this.userRepository.findLockState(userId)
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`)
    }

    return {
      isLocked: user.isLocked,
      failedAttempts: user.failedLoginAttempts,
      maxAttempts: this.config.maxAttempts,
      lockedAt: user.lockedAt || undefined,
      lockedUntil: user.lockedUntil || undefined,
      lockReason: user.lockReason || undefined,
      remainingAttempts: Math.max(0, this.config.maxAttempts - user.failedLoginAttempts)
    }
  }

  /** Unlocks every account whose lock has ended (backstop for missed unlock jobs) */
  async unlockExpiredAccounts(): Promise<number> {
    const expiredUsers = await this.userRepository.findExpiredLocks()
    for (const user of expiredUsers) {
      await this.unlockAccount(user.id, 'AUTO_UNLOCK')
    }
    if (expiredUsers.length > 0) {
      this.logger.info({ unlockedCount: expiredUsers.length }, 'Unlocked expired accounts')
    }
    return expiredUsers.length
  }
}
