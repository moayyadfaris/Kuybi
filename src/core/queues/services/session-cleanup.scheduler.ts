import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'
import { QueueName, SessionCleanupJobType } from '../jobs/types'

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
  }

  private async ensureRepeatableJob(
    jobId: string,
    jobName: SessionCleanupJobType,
    repeat: { pattern: string },
    data: Record<string, any> = {}
  ) {
    const existing = await this.sessionQueue.getRepeatableJobs()
    const alreadyScheduled = existing.some(job => job.id === jobId)
    if (alreadyScheduled) {
      return
    }

    await this.sessionQueue.add(jobName, data, {
      repeat,
      jobId
    })
  }
}
