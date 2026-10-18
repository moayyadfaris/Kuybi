import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { EmailQueueService } from '@infrastructure/email'
import { errorMessage } from '@shared/utils/error.util'
import { Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { LessThan, Repository } from 'typeorm'

import { User } from '@modules/users/entities'

import {
  AccountSecurityJobType,
  QueueName,
  ResetFailedAttemptsJobData,
  UnlockAccountJobData
} from '@core/queues/jobs/types'

export interface AccountLockoutConfig {
  enabled: boolean
  maxAttempts: number
  lockDuration: number // milliseconds
  resetAttemptsPeriod: number // milliseconds
  trackByIpAddress: boolean
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
  ADMIN_LOCK = 'ADMIN_LOCK',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION'
}

@Injectable()
export class AccountLockoutService {
  private readonly config: AccountLockoutConfig

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
      lockDuration: 30 * 60 * 1000, // 30 minutes
      resetAttemptsPeriod: 15 * 60 * 1000, // 15 minutes
      trackByIpAddress: true,
      notifyOnLockout: true,
      notifyOnUnlock: true
    })
  }

  /**
   * Record a failed login attempt and potentially lock the account
   */
  async recordFailedAttempt(userId: string, ipAddress?: string): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    // Atomic increment: concurrent failures (a parallel brute force) must all count.
    // Reading the counter and saving it back lost most of them.
    const result = await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ failedLoginAttempts: () => '"failedLoginAttempts" + 1' })
      .where('id = :userId', { userId })
      .returning(['failedLoginAttempts'])
      .execute()
    const rows = result.raw as Array<{ failedLoginAttempts: number }>
    if (rows.length === 0) {
      throw new NotFoundException(`User ${userId} not found`)
    }
    const failedAttempts = rows[0].failedLoginAttempts

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

    // Exactly one attempt reaches the threshold, so the account is locked (and the
    // unlock job and email sent) once, however many requests race past it
    if (failedAttempts === this.config.maxAttempts) {
      const user = await this.userRepository.findOneOrFail({ where: { id: userId } })
      await this.lockAccount(user, LockReason.FAILED_ATTEMPTS)
    } else if (failedAttempts < this.config.maxAttempts) {
      // Schedule reset of failed attempts after reset period
      await this.scheduleResetFailedAttempts(userId)
    }
  }

  /**
   * Lock an account
   */
  async lockAccount(user: User, reason: LockReason = LockReason.FAILED_ATTEMPTS): Promise<void> {
    const now = new Date()
    const unlockAt = new Date(now.getTime() + this.config.lockDuration)

    user.isLocked = true
    user.lockedAt = now
    user.lockedUntil = unlockAt
    user.lockReason = reason

    // Only the lock columns: saving the whole entity would overwrite failedLoginAttempts
    // with the value read earlier, undoing increments made concurrently
    await this.userRepository.update(user.id, {
      isLocked: true,
      lockedAt: now,
      lockedUntil: unlockAt,
      lockReason: reason
    })

    this.logger.warn(
      {
        userId: user.id,
        email: user.email,
        failedAttempts: user.failedLoginAttempts,
        lockedAt: now,
        lockedUntil: unlockAt,
        lockReason: reason,
        action: 'account_locked'
      },
      `Account locked due to ${reason}`
    )

    // Schedule automatic unlock
    await this.scheduleUnlock(user.id, unlockAt, reason)

    // Send email notification
    if (this.config.notifyOnLockout) {
      try {
        // Queued, not sent inline: this runs inside the login request
        await this.emailQueueService.queueAccountLockedEmail({
          to: user.email,
          userName: user.name,
          lockedAt: now,
          lockedUntil: unlockAt,
          failedAttempts: user.failedLoginAttempts
        })
        this.logger.info({ userId: user.id }, 'Lockout email queued')
      } catch (error) {
        this.logger.error(
          { userId: user.id, email: user.email, error: errorMessage(error) },
          'Failed to send lockout email'
        )
        // Don't throw - email failure shouldn't prevent lockout
      }
    }
  }

  /**
   * Schedule automatic unlock in the queue
   */
  private async scheduleUnlock(userId: string, unlockAt: Date, _lockReason: string): Promise<void> {
    const delay = unlockAt.getTime() - Date.now()

    if (delay <= 0) {
      // Already past unlock time, unlock immediately
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
      jobId: `unlock-${userId}-${Date.now()}` // Unique job ID
    })

    this.logger.info(
      {
        userId,
        unlockAt,
        delayMs: delay,
        action: 'scheduled_unlock'
      },
      `Scheduled automatic unlock in ${Math.round(delay / 1000)} seconds`
    )
  }

  /**
   * Schedule reset of failed attempts counter
   */
  private async scheduleResetFailedAttempts(userId: string): Promise<void> {
    const delay = this.config.resetAttemptsPeriod

    const jobData: ResetFailedAttemptsJobData = {
      userId,
      lastFailedAttempt: new Date(),
      timestamp: new Date().toISOString()
    }

    await this.accountSecurityQueue.add(AccountSecurityJobType.RESET_FAILED_ATTEMPTS, jobData, {
      delay,
      jobId: `reset-attempts-${userId}`, // Overwrite previous reset job
      removeOnComplete: true
    })

    this.logger.debug({ userId, delayMs: delay }, 'Scheduled reset of failed attempts counter')
  }

  /**
   * Unlock an account
   */
  async unlockAccount(userId: string, reason: 'AUTO_UNLOCK' | 'ADMIN_UNLOCK'): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`)
    }

    if (!user.isLocked) {
      this.logger.debug({ userId }, 'Account already unlocked, skipping')
      return
    }

    const previousAttempts = user.failedLoginAttempts

    user.isLocked = false
    user.failedLoginAttempts = 0
    user.lockedAt = null
    user.lockedUntil = null
    user.lockReason = null

    await this.userRepository.save(user)

    this.logger.info(
      {
        userId,
        email: user.email,
        reason,
        action: 'account_unlocked'
      },
      `Account unlocked: ${reason}`
    )

    // Send email notification
    if (this.config.notifyOnUnlock) {
      try {
        await this.emailQueueService.queueAccountUnlockedEmail({
          to: user.email,
          userName: user.name,
          unlockedAt: new Date(),
          unlockType: reason === 'AUTO_UNLOCK' ? 'automatic' : 'manual',
          previousAttempts
        })
        this.logger.info({ userId }, 'Unlock email queued')
      } catch (error) {
        this.logger.error(
          { userId, email: user.email, error: errorMessage(error) },
          'Failed to send unlock email'
        )
        // Don't throw - email failure shouldn't prevent unlock
      }
    }
  }

  /**
   * Check if an account is currently locked
   */
  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, isLocked: true, lockedUntil: true }
    })

    if (!user) {
      return false
    }

    // Check if lock has expired
    if (user.isLocked && user.lockedUntil && user.lockedUntil < new Date()) {
      // Lock expired, unlock automatically
      await this.unlockAccount(userId, 'AUTO_UNLOCK')
      return false
    }

    return user.isLocked
  }

  /**
   * Reset failed login attempts counter
   */
  async resetFailedAttempts(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      failedLoginAttempts: 0
    })

    this.logger.debug({ userId, action: 'reset_failed_attempts' }, 'Reset failed attempts counter')
  }

  /**
   * Get account lockout information
   */
  async getAccountLockInfo(userId: string): Promise<LockoutInfo> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: {
        id: true,
        isLocked: true,
        failedLoginAttempts: true,
        lockedAt: true,
        lockedUntil: true,
        lockReason: true
      }
    })

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

  /**
   * Get all locked accounts (for admin)
   */
  async getLockedAccounts(limit = 50, offset = 0): Promise<{ users: User[]; total: number }> {
    const [users, total] = await this.userRepository.findAndCount({
      where: { isLocked: true },
      take: limit,
      skip: offset,
      order: { lockedAt: 'DESC' }
    })

    return { users, total }
  }

  /**
   * Check and unlock expired locks (periodic cleanup job)
   */
  async unlockExpiredAccounts(): Promise<number> {
    const expiredUsers = await this.userRepository.find({
      where: {
        isLocked: true,
        lockedUntil: LessThan(new Date())
      }
    })

    let unlockedCount = 0
    for (const user of expiredUsers) {
      await this.unlockAccount(user.id, 'AUTO_UNLOCK')
      unlockedCount++
    }

    if (unlockedCount > 0) {
      this.logger.info({ unlockedCount }, `Unlocked ${unlockedCount} expired accounts`)
    }

    return unlockedCount
  }

  /**
   * Admin manual unlock
   */
  async adminUnlockAccount(userId: string, adminId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`)
    }

    this.logger.warn(
      {
        userId,
        adminId,
        action: 'admin_unlock'
      },
      'Admin manually unlocked account'
    )

    await this.unlockAccount(userId, 'ADMIN_UNLOCK')
  }
}
