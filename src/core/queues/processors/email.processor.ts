import { InjectQueue, Processor } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { EmailService } from '@infrastructure/email'
import { errorMessage, errorStack } from '@shared/utils/error.util'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import {
  AccountLockedEmailJobData,
  AccountUnlockedEmailJobData,
  CustomEmailJobData,
  EmailJobData,
  EmailJobType,
  PasswordChangedEmailJobData,
  PasswordResetEmailJobData,
  VerificationEmailJobData,
  VerifiedSuccessEmailJobData,
  WelcomeEmailJobData
} from '../jobs/email-jobs'
import { QueueName } from '../jobs/types'

import { BaseProcessor } from './base.processor'

/** Job data fields that hold live links or message bodies */
const SECRET_FIELD = /link|token|html|text/i

/**
 * Email Queue Processor
 *
 * Processes email jobs from the email queue with retry logic
 * and comprehensive error handling
 */
@Processor(QueueName.EMAIL, {
  concurrency: 5, // Process up to 5 emails concurrently
  // At most 500 emails a minute per worker, below typical SMTP provider limits
  limiter: { max: 500, duration: 60_000 }
})
@Injectable()
export class EmailProcessor extends BaseProcessor {
  constructor(
    private readonly emailService: EmailService,
    @InjectPinoLogger(EmailProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
    this.logger.info('EmailProcessor initialized - ready to process email jobs')
  }

  /**
   * Main process method - routes jobs to appropriate handlers
   */
  async process(job: Job<EmailJobData, unknown, EmailJobType>): Promise<unknown> {
    const startTime = Date.now()

    this.logger.info(
      {
        jobId: job.id,
        jobType: job.name,
        attempt: job.attemptsMade + 1,
        to: job.data.to
      },
      'Processing email job'
    )

    try {
      let result: unknown

      switch (job.name) {
        case EmailJobType.SEND_WELCOME:
          result = await this.processWelcomeEmail(job.data as WelcomeEmailJobData)
          break

        case EmailJobType.SEND_VERIFICATION:
          result = await this.processVerificationEmail(job.data as VerificationEmailJobData)
          break

        case EmailJobType.SEND_VERIFIED_SUCCESS:
          result = await this.processVerifiedSuccessEmail(job.data as VerifiedSuccessEmailJobData)
          break

        case EmailJobType.SEND_PASSWORD_RESET:
          result = await this.processPasswordResetEmail(job.data as PasswordResetEmailJobData)
          break

        case EmailJobType.SEND_PASSWORD_CHANGED:
          result = await this.processPasswordChangedEmail(job.data as PasswordChangedEmailJobData)
          break

        case EmailJobType.SEND_ACCOUNT_LOCKED: {
          const data = job.data as AccountLockedEmailJobData
          result = await this.emailService.sendAccountLockedEmail(
            data.to,
            data.userName || 'User',
            new Date(data.lockedAt),
            new Date(data.lockedUntil),
            data.failedAttempts
          )
          break
        }

        case EmailJobType.SEND_ACCOUNT_UNLOCKED: {
          const data = job.data as AccountUnlockedEmailJobData
          result = await this.emailService.sendAccountUnlockedEmail(
            data.to,
            data.userName || 'User',
            new Date(data.unlockedAt),
            data.unlockType,
            data.previousAttempts
          )
          break
        }

        case EmailJobType.SEND_CUSTOM:
          result = await this.processCustomEmail(job.data as CustomEmailJobData)
          break

        default:
          throw new Error(`Unknown email job type: ${job.name}`)
      }

      const duration = Date.now() - startTime

      this.logger.info(
        {
          jobId: job.id,
          jobType: job.name,
          to: job.data.to,
          duration
        },
        'Email job completed successfully'
      )

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      this.logger.error(
        {
          jobId: job.id,
          jobType: job.name,
          to: job.data.to,
          attempt: job.attemptsMade + 1,
          error: errorMessage(error),
          stack: errorStack(error),
          duration
        },
        'Email job failed'
      )

      throw error // Re-throw to trigger retry
    }
  }

  /**
   * Dead letters are kept until handled by hand: drop the live links (reset, verification)
   * and message bodies, keep what identifies the email
   */
  protected getDeadLetterData(job: Job<EmailJobData>): unknown {
    return Object.fromEntries(
      Object.entries(job.data).map(([key, value]) => [
        key,
        SECRET_FIELD.test(key) ? '[REDACTED]' : value
      ])
    )
  }

  /**
   * Process welcome email
   */
  private async processWelcomeEmail(data: WelcomeEmailJobData): Promise<void> {
    await this.emailService.sendWelcomeEmail(
      data.to,
      data.userName || 'User',
      data.verificationLink
    )
  }

  /**
   * Process email verification email
   */
  private async processVerificationEmail(data: VerificationEmailJobData): Promise<void> {
    await this.emailService.sendVerificationEmail(
      data.to,
      data.userName || 'User',
      data.verificationLink,
      data.expiresIn
    )
  }

  /**
   * Process email verified success email
   */
  private async processVerifiedSuccessEmail(data: VerifiedSuccessEmailJobData): Promise<void> {
    await this.emailService.sendEmailVerifiedSuccess(
      data.to,
      data.userName || 'User',
      data.loginUrl
    )
  }

  /**
   * Process password reset email
   */
  private async processPasswordResetEmail(data: PasswordResetEmailJobData): Promise<void> {
    await this.emailService.sendPasswordResetEmail(
      data.to,
      data.userName || 'User',
      data.resetLink,
      data.expiresIn
    )
  }

  /**
   * Process password changed confirmation email
   */
  private async processPasswordChangedEmail(data: PasswordChangedEmailJobData): Promise<void> {
    await this.emailService.sendPasswordChangedEmail(
      data.to,
      data.userName || 'User',
      // A string once the job data has been through JSON
      new Date(data.changeTime),
      data.ipAddress
    )
  }

  /**
   * Process custom email
   */
  private async processCustomEmail(data: CustomEmailJobData): Promise<void> {
    await this.emailService.sendMail({
      to: data.to,
      subject: data.subject,
      html: data.html,
      text: data.text
    })
  }
}
