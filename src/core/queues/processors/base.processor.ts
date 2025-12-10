import { WorkerHost } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

/**
 * Base Processor
 *
 * Abstract base class for all queue processors to ensure consistent
 * logging, error handling, and lifecycle management.
 */
export abstract class BaseProcessor extends WorkerHost {
  protected constructor(
    protected readonly logger: PinoLogger,
    private readonly deadLetterQueue?: Queue
  ) {
    super()
  }

  /**
   * Handle job active (started processing)
   */
  async onActive(job: Job) {
    this.logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade + 1,
        data: this.getLogData(job)
      },
      `Job ${job.name} started`
    )
  }

  /**
   * Handle job completion
   */
  async onCompleted(job: Job, result: any) {
    this.logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        duration: job.finishedOn ? job.finishedOn - job.processedOn! : 0,
        result
      },
      `Job ${job.name} completed`
    )
  }

  /**
   * Handle job failure
   */
  async onFailed(job: Job | undefined, error: Error) {
    if (!job) return

    this.logger.error(
      {
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade + 1,
        error: error.message,
        stack: error.stack,
        data: this.getLogData(job)
      },
      `Job ${job.name} failed`
    )

    const attemptsAllowed = job.opts.attempts ?? 1
    const attemptsMade = job.attemptsMade + 1

    if (this.deadLetterQueue && attemptsMade >= attemptsAllowed) {
      try {
        await this.deadLetterQueue.add('dead-letter', {
          originalQueue: job.queueName,
          jobName: job.name,
          data: job.data,
          attemptsAllowed,
          attemptsMade,
          failedReason: error.message,
          failedAt: new Date().toISOString()
        })
        this.logger.warn(
          { jobId: job.id, jobName: job.name, attemptsMade, attemptsAllowed },
          'Job moved to dead-letter queue'
        )
      } catch (dlqError) {
        this.logger.error(
          {
            jobId: job.id,
            jobName: job.name,
            error: (dlqError as Error).message
          },
          'Failed to publish job to dead-letter queue'
        )
      }
    }
  }

  /**
   * Helper to safely extract loggable data from job
   * Override this in subclasses if sensitive data needs masking
   */
  protected getLogData(job: Job): any {
    return job.data
  }
}
