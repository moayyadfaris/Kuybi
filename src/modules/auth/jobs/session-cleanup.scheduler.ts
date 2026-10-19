import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'

import { QueueName, SessionCleanupJobType } from '@core/queues/jobs/types'

@Injectable()
export class SessionCleanupScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.SESSION_CLEANUP)
    private readonly sessionQueue: Queue
  ) {}

  async onModuleInit() {
    await this.ensureRepeatableJob(
      'session-cleanup-hourly',
      SessionCleanupJobType.CLEANUP_EXPIRED,
      {
        pattern: '0 * * * *'
      }
    )

    await this.ensureRepeatableJob(
      'session-expiring-check',
      SessionCleanupJobType.CHECK_EXPIRING,
      {
        pattern: '*/30 * * * *'
      },
      { withinMinutes: 60 }
    )

    await this.ensureRepeatableJob(
      'password-reset-cleanup-daily',
      SessionCleanupJobType.CLEANUP_RESET_TOKENS,
      { pattern: '30 3 * * *' }
    )
  }

  /**
   * Creates or updates a BullMQ job scheduler. Idempotent, and unlike the legacy
   * repeatable jobs (removed in BullMQ 6) a changed pattern or payload takes effect.
   */
  private async ensureRepeatableJob(
    schedulerId: string,
    jobName: SessionCleanupJobType,
    repeat: { pattern: string },
    data: Record<string, unknown> = {}
  ) {
    await this.sessionQueue.upsertJobScheduler(schedulerId, repeat, { name: jobName, data })
  }
}
