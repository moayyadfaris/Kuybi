import { Module } from '@nestjs/common'

import { QueuesModule } from '@core/queues/queues.module'

import { AuditModule } from '../audit.module'

import { AuditRetentionProcessor } from './audit-retention.processor'
import { AuditRetentionScheduler } from './audit-retention.scheduler'

/**
 * Background jobs for the audit module. Imported only by the worker process:
 * processors start consuming as soon as they are instantiated.
 */
@Module({
  imports: [QueuesModule, AuditModule],
  providers: [AuditRetentionProcessor, AuditRetentionScheduler]
})
export class AuditJobsModule {}
