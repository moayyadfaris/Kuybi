import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { QueueName } from '@core/queues/jobs/types';
import {
  EmailJobType,
  EmailJobData,
  WelcomeEmailJobData,
  VerificationEmailJobData,
  VerifiedSuccessEmailJobData,
  PasswordResetEmailJobData,
  PasswordChangedEmailJobData,
  CustomEmailJobData,
  EmailJobOptions,
  DEFAULT_EMAIL_JOB_OPTIONS,
} from '@core/queues/jobs/email-jobs';

/**
 * Email Queue Service
 * 
 * Manages email job creation and queueing for background processing
 */
@Injectable()
export class EmailQueueService {
  constructor(
    @InjectQueue(QueueName.EMAIL) private readonly emailQueue: Queue,
    @InjectPinoLogger(EmailQueueService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Queue a welcome email
   */
  async queueWelcomeEmail(
    to: string,
    userName: string,
    verificationLink: string,
    options?: EmailJobOptions,
  ): Promise<string> {
    const jobData: WelcomeEmailJobData = {
      to,
      userName,
      verificationLink,
    };

    const job = await this.emailQueue.add(
      EmailJobType.SEND_WELCOME,
      jobData,
      {
        ...DEFAULT_EMAIL_JOB_OPTIONS,
        ...options,
      },
    );

    this.logger.info(
      {
        jobId: job.id,
        jobType: EmailJobType.SEND_WELCOME,
        to,
      },
      'Welcome email queued',
    );

    return job.id;
  }

  /**
   * Queue a verification email
   */
  async queueVerificationEmail(
    to: string,
    userName: string,
    verificationLink: string,
    expiresIn?: string,
    options?: EmailJobOptions,
  ): Promise<string> {
    const jobData: VerificationEmailJobData = {
      to,
      userName,
      verificationLink,
      expiresIn,
    };

    const job = await this.emailQueue.add(
      EmailJobType.SEND_VERIFICATION,
      jobData,
      {
        ...DEFAULT_EMAIL_JOB_OPTIONS,
        ...options,
      },
    );

    this.logger.info(
      {
        jobId: job.id,
        jobType: EmailJobType.SEND_VERIFICATION,
        to,
      },
      'Verification email queued',
    );

    return job.id;
  }

  /**
   * Queue a verified success email
   */
  async queueVerifiedSuccessEmail(
    to: string,
    userName: string,
    loginUrl: string,
    options?: EmailJobOptions,
  ): Promise<string> {
    const jobData: VerifiedSuccessEmailJobData = {
      to,
      userName,
      loginUrl,
    };

    const job = await this.emailQueue.add(
      EmailJobType.SEND_VERIFIED_SUCCESS,
      jobData,
      {
        ...DEFAULT_EMAIL_JOB_OPTIONS,
        ...options,
      },
    );

    this.logger.info(
      {
        jobId: job.id,
        jobType: EmailJobType.SEND_VERIFIED_SUCCESS,
        to,
      },
      'Verified success email queued',
    );

    return job.id;
  }

  /**
   * Queue a password reset email
   */
  async sendPasswordResetEmail(data: {
    to: string;
    firstName: string;
    resetLink: string;
    resetToken: string;
    expiresInMinutes: number;
  }, options?: EmailJobOptions): Promise<string> {
    const jobData: PasswordResetEmailJobData = {
      to: data.to,
      userName: data.firstName,
      resetLink: data.resetLink,
      expiresIn: `${data.expiresInMinutes} minutes`,
    };

    const job = await this.emailQueue.add(
      EmailJobType.SEND_PASSWORD_RESET,
      jobData,
      {
        ...DEFAULT_EMAIL_JOB_OPTIONS,
        ...options,
      },
    );

    this.logger.info(
      {
        jobId: job.id,
        jobType: EmailJobType.SEND_PASSWORD_RESET,
        to: data.to,
      },
      'Password reset email queued',
    );

    return job.id;
  }

  /**
   * Queue a password changed confirmation email
   */
  async sendPasswordChangedEmail(data: {
    to: string;
    firstName: string;
    resetTime: string;
    resetIpAddress: string;
  }, options?: EmailJobOptions): Promise<string> {
    const jobData: PasswordChangedEmailJobData = {
      to: data.to,
      userName: data.firstName,
      changeTime: new Date(data.resetTime),
      ipAddress: data.resetIpAddress,
    };

    const job = await this.emailQueue.add(
      EmailJobType.SEND_PASSWORD_CHANGED,
      jobData,
      {
        ...DEFAULT_EMAIL_JOB_OPTIONS,
        ...options,
      },
    );

    this.logger.info(
      {
        jobId: job.id,
        jobType: EmailJobType.SEND_PASSWORD_CHANGED,
        to: data.to,
      },
      'Password changed email queued',
    );

    return job.id;
  }

  /**
   * Queue a custom email
   */
  async queueCustomEmail(
    data: CustomEmailJobData,
    options?: EmailJobOptions,
  ): Promise<string> {
    const job = await this.emailQueue.add(
      EmailJobType.SEND_CUSTOM,
      data,
      {
        ...DEFAULT_EMAIL_JOB_OPTIONS,
        ...options,
      },
    );

    this.logger.info(
      {
        jobId: job.id,
        jobType: EmailJobType.SEND_CUSTOM,
        to: data.to,
        subject: data.subject,
      },
      'Custom email queued',
    );

    return job.id;
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.emailQueue.getJob(jobId);
    
    if (!job) {
      return null;
    }

    const state = await job.getState();
    
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      state,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
    };
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
      this.emailQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.emailQueue.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.retry();
    
    this.logger.info(
      {
        jobId,
        jobType: job.name,
      },
      'Email job manually retried',
    );
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.emailQueue.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.remove();
    
    this.logger.info(
      {
        jobId,
        jobType: job.name,
      },
      'Email job removed from queue',
    );
  }

  /**
   * Clean completed jobs older than specified age
   */
  async cleanCompletedJobs(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    await this.emailQueue.clean(olderThanMs, 100, 'completed');
    
    this.logger.info(
      {
        olderThanMs,
      },
      'Cleaned completed email jobs',
    );
  }

  /**
   * Clean failed jobs older than specified age
   */
  async cleanFailedJobs(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.emailQueue.clean(olderThanMs, 500, 'failed');
    
    this.logger.info(
      {
        olderThanMs,
      },
      'Cleaned failed email jobs',
    );
  }
}
