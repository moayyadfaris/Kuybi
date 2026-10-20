import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'

import { AuditRetentionJobType, QueueName } from '@core/queues/jobs/types'

import { PurgeExpiredJobData } from './audit-retention.processor'

/**
 * Daily audit purge at 03:00 UTC. upsertJobScheduler is idempotent and applies changed
 * retention settings (AUDIT_RETENTION_DAYS, AUDIT_CRITICAL_RETENTION_DAYS) on the next start.
 */
@Injectable()
export class AuditRetentionScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.AUDIT_RETENTION)
    private readonly queue: Queue,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    const data: PurgeExpiredJobData = {
      retentionDays: this.configService.get<number>('audit.retentionDays', 180),
      criticalRetentionDays: this.configService.get<number>('audit.criticalRetentionDays', 365)
    }
    await this.queue.upsertJobScheduler(
      'audit-retention-daily',
      { pattern: '0 3 * * *' },
      { name: AuditRetentionJobType.PURGE_EXPIRED, data }
    )
  }
}
