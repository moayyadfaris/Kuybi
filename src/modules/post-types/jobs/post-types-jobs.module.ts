import { Module } from '@nestjs/common'

import { QueuesModule } from '@core/queues/queues.module'

import { PostTypesModule } from '../post-types.module'

import { ContentPublishingProcessor } from './content-publishing.processor'
import { ContentPublishingScheduler } from './content-publishing.scheduler'

/**
 * Background jobs for the post-types module. Imported only by the worker process:
 * processors start consuming as soon as they are instantiated.
 */
@Module({
  imports: [QueuesModule, PostTypesModule],
  providers: [ContentPublishingProcessor, ContentPublishingScheduler]
})
export class PostTypesJobsModule {}
