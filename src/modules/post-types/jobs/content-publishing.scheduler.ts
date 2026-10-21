import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'

import { ContentJobType, QueueName } from '@core/queues/jobs/types'

/** Checks for scheduled entries to publish every minute (idempotent upsert) */
@Injectable()
export class ContentPublishingScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.CONTENT_PUBLISHING)
    private readonly queue: Queue
  ) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'content-publish-due',
      { pattern: '* * * * *', tz: 'UTC' },
      { name: ContentJobType.PUBLISH_DUE, data: {} }
    )
  }
}
