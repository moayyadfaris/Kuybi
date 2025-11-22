import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { EmailService } from '@infrastructure/email/services/email.service'
import { Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { LessThan, Repository } from 'typeorm'

import { User } from '@modules/users/entities/user.entity'

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
    private readonly emailService: EmailService,
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

    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`)
    }

    // Increment failed attempts
    user.failedLoginAttempts += 1

    this.logger.info(
      {
        userId,
        failedAttempts: user.failedLoginAttempts,
        maxAttempts: this.config.maxAttempts,
        ipAddress,
        action: 'failed_login_attempt'
      },
      `Failed login attempt ${user.failedLoginAttempts}/${this.config.maxAttempts}`
    )

    // Check if threshold exceeded
    if (user.failedLoginAttempts >= this.config.maxAttempts) {
      await this.lockAccount(user, LockReason.FAILED_ATTEMPTS)
    } else {
      await this.userRepository.save(user)

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

    await this.userRepository.save(user)

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
        await this.emailService.sendAccountLockedEmail(
          user.email,
          user.name,
          now,
          unlockAt,
          user.failedLoginAttempts
        )
        this.logger.info({ userId: user.id, email: user.email }, 'Lockout email sent successfully')
      } catch (error) {
        this.logger.error(
          { userId: user.id, email: user.email, error: error.message },
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
        await this.emailService.sendAccountUnlockedEmail(
          user.email,
          user.name,
          new Date(),
          reason === 'AUTO_UNLOCK' ? 'automatic' : 'manual',
          previousAttempts
        )
        this.logger.info({ userId, email: user.email }, 'Unlock email sent successfully')
      } catch (error) {
        this.logger.error(
          { userId, email: user.email, error: error.message },
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
      select: ['id', 'isLocked', 'lockedUntil']
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
      select: ['id', 'isLocked', 'failedLoginAttempts', 'lockedAt', 'lockedUntil', 'lockReason']
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
