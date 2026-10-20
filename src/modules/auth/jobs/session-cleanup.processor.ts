import { InjectQueue, Processor } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { QueueName, SessionCleanupJobType } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { PasswordResetService } from '../services/password-reset.service'
import { SessionsService } from '../services/sessions.service'

/** Expired reset tokens are kept this long (for support questions), then deleted */
const RESET_TOKEN_RETENTION_DAYS = 1

interface CleanupJobData {
  olderThanDays?: number
}

@Processor(QueueName.SESSION_CLEANUP)
export class SessionCleanupProcessor extends BaseProcessor {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly passwordResetService: PasswordResetService,
    @InjectPinoLogger(SessionCleanupProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
  }

  /** Routes each job of the session-cleanup queue by name (see AuthJobsScheduler) */
  async process(job: Job<CleanupJobData>) {
    switch (job.name) {
      case SessionCleanupJobType.CLEANUP_EXPIRED:
        return this.handleCleanup(job as Job<CleanupJobData>)
      case SessionCleanupJobType.CLEANUP_RESET_TOKENS:
        return {
          deleted: await this.passwordResetService.cleanupExpiredTokens(RESET_TOKEN_RETENTION_DAYS)
        }
      default:
        this.logger.warn(
          { jobId: job.id, jobName: job.name },
          'Unknown session cleanup job received'
        )
        return { ignored: true }
    }
  }

  private async handleCleanup(job: Job<CleanupJobData>) {
    const olderThanDays = job.data?.olderThanDays ?? 30
    this.logger.info({ jobId: job.id, olderThanDays }, 'Running session cleanup job')
    const result = await this.sessionsService.cleanupExpiredSessions(olderThanDays)
    this.logger.info({ jobId: job.id, deleted: result.deleted }, 'Session cleanup completed')
    return result
  }
}
