import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'

import { AttachmentJobType, QueueName } from '@core/queues/jobs/types'

/**
 * The attachments module's recurring jobs (worker process only; upserted by id, so the
 * schedule exists once however many workers start). The abandoned-upload cleanup used to
 * be an @Cron in every API instance.
 */
@Injectable()
export class AttachmentsJobsScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.ATTACHMENT_PROCESSING)
    private readonly queue: Queue
  ) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'abandoned-uploads-hourly',
      { pattern: '15 * * * *', tz: 'UTC' },
      { name: AttachmentJobType.REMOVE_ABANDONED_UPLOADS, data: {} }
    )
  }
}
