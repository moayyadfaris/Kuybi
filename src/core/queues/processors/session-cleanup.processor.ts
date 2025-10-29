import { Processor, InjectQueue, WorkerHost } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { SessionCleanupJobType, QueueName } from '../jobs/types'
import { SessionsService } from '@modules/auth/services/sessions.service'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { SessionRepository } from '@core/database/repositories/session.repository'

interface CleanupJobData {
  olderThanDays?: number
}

interface ExpiringJobData extends CleanupJobData {
  withinMinutes?: number
}

@Processor(QueueName.SESSION_CLEANUP)
export class SessionCleanupProcessor extends WorkerHost {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly sessionRepository: SessionRepository,
    @InjectPinoLogger(SessionCleanupProcessor.name)
    private readonly logger: PinoLogger,
    @InjectQueue(QueueName.SESSION_CLEANUP)
    private readonly sessionQueue: Queue
  ) {
    super()
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

  /**
   * Utility to enqueue ad-hoc cleanup jobs (used by API for manual triggers)
   */
  async enqueueCleanup(olderThanDays = 30) {
    await this.sessionQueue.add(SessionCleanupJobType.CLEANUP_EXPIRED, { olderThanDays })
  }
}
