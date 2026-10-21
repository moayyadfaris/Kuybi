import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

/**
 * Base of every queue processor: logs the job lifecycle and moves a job that failed its
 * last attempt to the dead-letter queue (once: its id there is derived from the job).
 *
 * Job data is not logged by default: jobs can carry personal data and secrets (emails
 * with reset and verification links). A processor may log a safe projection by
 * overriding getLogData.
 */
export abstract class BaseProcessor extends WorkerHost {
  protected constructor(
    protected readonly logger: PinoLogger,
    private readonly deadLetterQueue?: Queue
  ) {
    super()
  }

  @OnWorkerEvent('active')
  onActive(job: Job): void {
    this.logger.debug(
      {
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade + 1,
        data: this.getLogData(job)
      },
      `Job ${job.name} started`
    )
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(
      {
        jobId: job.id,
        jobName: job.name,
        durationMs: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined
      },
      `Job ${job.name} completed`
    )
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error): Promise<void> {
    if (!job) return

    // BullMQ has counted this attempt when it emits 'failed'
    const attemptsMade = job.attemptsMade
    const attemptsAllowed = job.opts.attempts ?? 1
    const final = attemptsMade >= attemptsAllowed

    this.logger[final ? 'error' : 'warn'](
      {
        jobId: job.id,
        jobName: job.name,
        attemptsMade,
        attemptsAllowed,
        error: error.message,
        data: this.getLogData(job)
      },
      final ? `Job ${job.name} failed for good` : `Job ${job.name} failed, will retry`
    )
    if (!final || !this.deadLetterQueue) return

    try {
      await this.deadLetterQueue.add(
        'dead-letter',
        {
          originalQueue: job.queueName,
          originalJobId: job.id,
          jobName: job.name,
          data: this.getDeadLetterData(job),
          attemptsAllowed,
          attemptsMade,
          failedReason: error.message,
          failedAt: new Date().toISOString()
        },
        // A repeated 'failed' event for the same job does not add a second entry
        { jobId: `${job.queueName}-${job.id}` }
      )
      this.logger.warn({ jobId: job.id, jobName: job.name }, 'Job moved to dead-letter queue')
    } catch (dlqError) {
      this.logger.error(
        { jobId: job.id, jobName: job.name, error: (dlqError as Error).message },
        'Failed to publish job to dead-letter queue'
      )
    }
  }

  /** The job data kept in the dead-letter queue (indefinitely); all of it by default */
  protected getDeadLetterData(job: Job): unknown {
    return job.data
  }

  /** What of a job's data may be logged; nothing unless a processor says otherwise */
  protected getLogData(_job: Job): Record<string, unknown> | undefined {
    return undefined
  }
}
