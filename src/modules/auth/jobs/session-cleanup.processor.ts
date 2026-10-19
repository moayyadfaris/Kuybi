import { InjectQueue, Processor } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { QueueName, SessionCleanupJobType } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { SessionRepository } from '../repositories/session.repository'
import { PasswordResetService } from '../services/password-reset.service'
import { SessionsService } from '../services/sessions.service'

/** Expired reset tokens are kept this long (for support questions), then deleted */
const RESET_TOKEN_RETENTION_DAYS = 1

interface CleanupJobData {
  olderThanDays?: number
}

interface ExpiringJobData extends CleanupJobData {
  withinMinutes?: number
}

@Processor(QueueName.SESSION_CLEANUP)
export class SessionCleanupProcessor extends BaseProcessor {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordResetService: PasswordResetService,
    @InjectPinoLogger(SessionCleanupProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
  }

  /**
   * Central dispatch for BullMQ jobs. Each job name is routed to the handler that
   * previously used the @Process decorator (Bull v3 style).
   */
  async process(job: Job<CleanupJobData | ExpiringJobData>) {
    switch (job.name) {
      case SessionCleanupJobType.CLEANUP_EXPIRED:
        return this.handleCleanup(job as Job<CleanupJobData>)
      case SessionCleanupJobType.CHECK_EXPIRING:
        return this.handleCheckExpiring(job as Job<ExpiringJobData>)
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

  private async handleCheckExpiring(job: Job<ExpiringJobData>) {
    const withinMinutes = job.data?.withinMinutes ?? 60
    this.logger.debug({ jobId: job.id, withinMinutes }, 'Checking for expiring sessions')
    const expiring = await this.sessionRepository.findExpiringSoon(withinMinutes)
    if (expiring.length > 0) {
      this.logger.warn({ count: expiring.length, withinMinutes }, 'Sessions are expiring soon')
    }
    return { count: expiring.length }
  }
}
