import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { EmailService } from '@infrastructure/email'
import { Job } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import {
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

/**
 * Email Queue Processor
 *
 * Processes email jobs from the email queue with retry logic
 * and comprehensive error handling
 */
@Processor(QueueName.EMAIL, {
  concurrency: 5 // Process up to 5 emails concurrently
})
@Injectable()
export class EmailProcessor extends WorkerHost {
  constructor(
    private readonly emailService: EmailService,
    @InjectPinoLogger(EmailProcessor.name)
    private readonly logger: PinoLogger
  ) {
    super()
    this.logger.info('EmailProcessor initialized - ready to process email jobs')
  }

  /**
   * Main process method - routes jobs to appropriate handlers
   */
  async process(job: Job<EmailJobData, any, EmailJobType>): Promise<any> {
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
      let result: any

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
          error: error.message,
          stack: error.stack,
          duration
        },
        'Email job failed'
      )

      throw error // Re-throw to trigger retry
    }
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
      data.changeTime,
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

  /**
   * Handle job completion
   */
  async onCompleted(job: Job<EmailJobData, any, EmailJobType>) {
    this.logger.debug(
      {
        jobId: job.id,
        jobType: job.name,
        to: job.data.to
      },
      'Email job marked as completed'
    )
  }

  /**
   * Handle job failure (after all retries exhausted)
   */
  async onFailed(job: Job<EmailJobData, any, EmailJobType>, error: Error) {
    this.logger.error(
      {
        jobId: job.id,
        jobType: job.name,
        to: job.data.to,
        attempts: job.attemptsMade,
        error: error.message
      },
      'Email job failed permanently after all retry attempts'
    )
  }

  /**
   * Handle job active (started processing)
   */
  async onActive(job: Job<EmailJobData, any, EmailJobType>) {
    this.logger.debug(
      {
        jobId: job.id,
        jobType: job.name,
        to: job.data.to
      },
      'Email job started processing'
    )
  }
}
