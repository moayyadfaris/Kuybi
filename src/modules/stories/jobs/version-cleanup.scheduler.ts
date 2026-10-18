import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'

import { QueueName, VersionCleanupJobType } from '@core/queues/jobs/types'

@Injectable()
export class VersionCleanupScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.VERSION_CLEANUP)
    private readonly versionQueue: Queue
  ) {}

  async onModuleInit() {
    // Run cleanup daily at 2 AM UTC
    await this.ensureRepeatableJob('version-cleanup-daily', VersionCleanupJobType.CLEANUP_EXPIRED, {
      pattern: '0 2 * * *' // 2 AM daily
    })

    // Archive old versions weekly on Sunday at 3 AM UTC
    await this.ensureRepeatableJob(
      'version-archive-weekly',
      VersionCleanupJobType.ARCHIVE_OLD,
      {
        pattern: '0 3 * * 0' // 3 AM every Sunday
      },
      { olderThanDays: 90 }
    )
  }

  /**
   * Creates or updates a BullMQ job scheduler. Idempotent, and unlike the legacy
   * repeatable jobs (removed in BullMQ 6) a changed pattern or payload takes effect.
   */
  private async ensureRepeatableJob(
    schedulerId: string,
    jobName: VersionCleanupJobType,
    repeat: { pattern: string },
    data: Record<string, unknown> = {}
  ) {
    await this.versionQueue.upsertJobScheduler(schedulerId, repeat, { name: jobName, data })
  }
}
