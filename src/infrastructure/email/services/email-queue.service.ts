import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { EntityManager } from 'typeorm'

import { OutboxService } from '@core/outbox'
import {
  AccountLockedEmailJobData,
  AccountUnlockedEmailJobData,
  CustomEmailJobData,
  DEFAULT_EMAIL_JOB_OPTIONS,
  EmailJobOptions,
  EmailJobType,
  PasswordChangedEmailJobData,
  PasswordResetEmailJobData,
  VerificationEmailJobData,
  VerifiedSuccessEmailJobData,
  WelcomeEmailJobData
} from '@core/queues/jobs/email-jobs'
import { QueueName } from '@core/queues/jobs/types'

/** Job options, plus the transaction the email belongs to */
export type EmailEnqueueOptions = EmailJobOptions & {
  /**
   * EntityManager of the caller's transaction: the email is sent if and only if that
   * transaction commits (e.g. the user row and the welcome email)
   */
  manager?: EntityManager
}

/**
 * Email Queue Service
 *
 * Emails are recorded in the transactional outbox and reach the email queue through
 * OutboxRelay, so a Redis outage cannot lose them and a rolled-back transaction cannot
 * send them. Returned ids are outbox message ids, which are also the BullMQ job ids.
 */
@Injectable()
export class EmailQueueService {
  constructor(
    @InjectQueue(QueueName.EMAIL) private readonly emailQueue: Queue,
    private readonly outbox: OutboxService,
    @InjectPinoLogger(EmailQueueService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Queue a welcome email
   */
  async queueWelcomeEmail(
    to: string,
    userName: string,
    verificationLink: string,
    options?: EmailEnqueueOptions
  ): Promise<string> {
    const jobData: WelcomeEmailJobData = {
      to,
      userName,
      verificationLink
    }

    const jobId = await this.enqueue(EmailJobType.SEND_WELCOME, jobData, options)

    this.logger.info(
      {
        jobId,
        jobType: EmailJobType.SEND_WELCOME,
        to
      },
      'Welcome email queued'
    )

    return jobId
  }

  /**
   * Queue a verification email
   */
  async queueVerificationEmail(
    to: string,
    userName: string,
    verificationLink: string,
    expiresIn?: string,
    options?: EmailEnqueueOptions
  ): Promise<string> {
    const jobData: VerificationEmailJobData = {
      to,
      userName,
      verificationLink,
      expiresIn
    }

    const jobId = await this.enqueue(EmailJobType.SEND_VERIFICATION, jobData, options)

    this.logger.info(
      {
        jobId,
        jobType: EmailJobType.SEND_VERIFICATION,
        to
      },
      'Verification email queued'
    )

    return jobId
  }

  /**
   * Queue a verified success email
   */
  async queueVerifiedSuccessEmail(
    to: string,
    userName: string,
    loginUrl: string,
    options?: EmailEnqueueOptions
  ): Promise<string> {
    const jobData: VerifiedSuccessEmailJobData = {
      to,
      userName,
      loginUrl
    }

    const jobId = await this.enqueue(EmailJobType.SEND_VERIFIED_SUCCESS, jobData, options)

    this.logger.info(
      {
        jobId,
        jobType: EmailJobType.SEND_VERIFIED_SUCCESS,
        to
      },
      'Verified success email queued'
    )

    return jobId
  }

  /**
   * Queue a password reset email
   */
  async sendPasswordResetEmail(
    data: {
      to: string
      firstName: string
      resetLink: string
      resetToken: string
      expiresInMinutes: number
    },
    options?: EmailEnqueueOptions
  ): Promise<string> {
    const jobData: PasswordResetEmailJobData = {
      to: data.to,
      userName: data.firstName,
      resetLink: data.resetLink,
      expiresIn: `${data.expiresInMinutes} minutes`
    }

    const jobId = await this.enqueue(EmailJobType.SEND_PASSWORD_RESET, jobData, options)

    this.logger.info(
      {
        jobId,
        jobType: EmailJobType.SEND_PASSWORD_RESET,
        to: data.to
      },
      'Password reset email queued'
    )

    return jobId
  }

  /**
   * Queue a password changed confirmation email
   */
  async sendPasswordChangedEmail(
    data: {
      to: string
      firstName: string
      resetTime: string
      resetIpAddress: string
    },
    options?: EmailEnqueueOptions
  ): Promise<string> {
    const jobData: PasswordChangedEmailJobData = {
      to: data.to,
      userName: data.firstName,
      changeTime: new Date(data.resetTime),
      ipAddress: data.resetIpAddress
    }

    const jobId = await this.enqueue(EmailJobType.SEND_PASSWORD_CHANGED, jobData, options)

    this.logger.info(
      {
        jobId,
        jobType: EmailJobType.SEND_PASSWORD_CHANGED,
        to: data.to
      },
      'Password changed email queued'
    )

    return jobId
  }

  async queueAccountLockedEmail(
    data: {
      to: string
      userName: string
      lockedAt: Date
      lockedUntil: Date
      failedAttempts: number
    },
    options?: EmailEnqueueOptions
  ): Promise<string> {
    const jobData: AccountLockedEmailJobData = {
      to: data.to,
      userName: data.userName,
      lockedAt: data.lockedAt.toISOString(),
      lockedUntil: data.lockedUntil.toISOString(),
      failedAttempts: data.failedAttempts
    }
    return this.enqueue(EmailJobType.SEND_ACCOUNT_LOCKED, jobData, { priority: 1, ...options })
  }

  async queueAccountUnlockedEmail(
    data: {
      to: string
      userName: string
      unlockedAt: Date
      unlockType: 'automatic' | 'manual'
      previousAttempts?: number
    },
    options?: EmailEnqueueOptions
  ): Promise<string> {
    const jobData: AccountUnlockedEmailJobData = {
      to: data.to,
      userName: data.userName,
      unlockedAt: data.unlockedAt.toISOString(),
      unlockType: data.unlockType,
      previousAttempts: data.previousAttempts
    }
    return this.enqueue(EmailJobType.SEND_ACCOUNT_UNLOCKED, jobData, options)
  }

  /**
   * Queue a custom email
   */
  async queueCustomEmail(data: CustomEmailJobData, options?: EmailEnqueueOptions): Promise<string> {
    const jobId = await this.enqueue(EmailJobType.SEND_CUSTOM, data, options)

    this.logger.info(
      {
        jobId,
        jobType: EmailJobType.SEND_CUSTOM,
        to: data.to,
        subject: data.subject
      },
      'Custom email queued'
    )

    return jobId
  }

  private enqueue(
    name: EmailJobType,
    data: object,
    options: EmailEnqueueOptions = {}
  ): Promise<string> {
    const { manager, delay, ...jobOptions } = options
    return this.outbox.enqueue(
      {
        queue: QueueName.EMAIL,
        name,
        data,
        options: { ...DEFAULT_EMAIL_JOB_OPTIONS, ...jobOptions },
        delayMs: delay
      },
      manager
    )
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.emailQueue.getJob(jobId)

    if (!job) {
      return null
    }

    const state = await job.getState()

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      state,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.emailQueue.getWaitingCount(),
      this.emailQueue.getActiveCount(),
      this.emailQueue.getCompletedCount(),
      this.emailQueue.getFailedCount(),
      this.emailQueue.getDelayedCount()
    ])

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.emailQueue.getJob(jobId)

    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    await job.retry()

    this.logger.info(
      {
        jobId,
        jobType: job.name
      },
      'Email job manually retried'
    )
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.emailQueue.getJob(jobId)

    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    await job.remove()

    this.logger.info(
      {
        jobId,
        jobType: job.name
      },
      'Email job removed from queue'
    )
  }

  /**
   * Clean completed jobs older than specified age
   */
  async cleanCompletedJobs(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    await this.emailQueue.clean(olderThanMs, 100, 'completed')

    this.logger.info(
      {
        olderThanMs
      },
      'Cleaned completed email jobs'
    )
  }

  /**
   * Clean failed jobs older than specified age
   */
  async cleanFailedJobs(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.emailQueue.clean(olderThanMs, 500, 'failed')

    this.logger.info(
      {
        olderThanMs
      },
      'Cleaned failed email jobs'
    )
  }
}
