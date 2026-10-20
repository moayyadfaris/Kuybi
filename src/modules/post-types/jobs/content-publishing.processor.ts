import { InjectQueue, Processor } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { ContentJobType, QueueName } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { ContentService } from '../services/content.service'

/** Publishes scheduled entries whose time has come (ContentPublishingScheduler, every minute) */
@Processor(QueueName.CONTENT_PUBLISHING)
export class ContentPublishingProcessor extends BaseProcessor {
  constructor(
    private readonly contentService: ContentService,
    @InjectPinoLogger(ContentPublishingProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== ContentJobType.PUBLISH_DUE) {
      this.logger.warn({ jobId: job.id, jobName: job.name }, 'Unknown content publishing job')
      return { ignored: true }
    }
    const published = await this.contentService.publishDue(new Date())
    if (published > 0) {
      this.logger.info({ jobId: job.id, published }, 'Published scheduled content')
    }
    return { published }
  }
}
