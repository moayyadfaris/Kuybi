import { InjectQueue, Processor } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AuditRetentionJobType, QueueName } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { AuditLogRepository } from '../database/audit-log.repository'

export interface PurgeExpiredJobData {
  /** Days rows are kept; 0 keeps them forever */
  retentionDays: number
  /** Days critical rows are kept; 0, or less than retentionDays, means retentionDays */
  criticalRetentionDays: number
}

/** Rows deleted per statement; a run repeats until nothing expired is left */
const PURGE_BATCH = 5000
const DAY_MS = 24 * 60 * 60 * 1000

/** Audit retention, scheduled daily by AuditRetentionScheduler */
@Processor(QueueName.AUDIT_RETENTION)
export class AuditRetentionProcessor extends BaseProcessor {
  constructor(
    private readonly auditLogRepository: AuditLogRepository,
    @InjectPinoLogger(AuditRetentionProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
  }

  async process(job: Job<PurgeExpiredJobData>): Promise<unknown> {
    if (job.name !== AuditRetentionJobType.PURGE_EXPIRED) {
      this.logger.warn({ jobId: job.id, jobName: job.name }, 'Unknown audit retention job')
      return { ignored: true }
    }

    const { retentionDays, criticalRetentionDays } = job.data
    if (retentionDays <= 0) return { deleted: 0 }

    // Critical rows are never kept for less time than the others
    const criticalDays = Math.max(retentionDays, criticalRetentionDays)
    const now = Date.now()
    const before = new Date(now - retentionDays * DAY_MS)
    const criticalBefore = new Date(now - criticalDays * DAY_MS)

    let deleted = 0
    for (;;) {
      const count = await this.auditLogRepository.deleteExpired(before, criticalBefore, PURGE_BATCH)
      deleted += count
      if (count < PURGE_BATCH) break
    }
    this.logger.info(
      { jobId: job.id, retentionDays, criticalRetentionDays: criticalDays, deleted },
      'Purged expired audit logs'
    )
    return { deleted }
  }
}
