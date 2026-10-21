import { Module } from '@nestjs/common'

import { QueuesModule } from '@core/queues/queues.module'

import { AttachmentsModule } from '../attachments.module'

import { AttachmentProcessor } from './attachment.processor'
import { AttachmentsJobsScheduler } from './attachments-jobs.scheduler'

/**
 * Background jobs for the attachments module. Imported only by the worker process:
 * processors start consuming as soon as they are instantiated.
 */
@Module({
  imports: [QueuesModule, AttachmentsModule],
  providers: [AttachmentProcessor, AttachmentsJobsScheduler]
})
export class AttachmentsJobsModule {}
