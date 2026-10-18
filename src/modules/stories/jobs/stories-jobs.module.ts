import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { QueuesModule } from '@core/queues/queues.module'

import { StoryVersion } from '../entities/story-version.entity'
import { StoriesModule } from '../stories.module'

import { VersionCleanupProcessor } from './version-cleanup.processor'
import { VersionCleanupScheduler } from './version-cleanup.scheduler'

/**
 * Background jobs for the stories module. Imported only by the worker process:
 * processors start consuming as soon as they are instantiated.
 */
@Module({
  imports: [QueuesModule, StoriesModule, TypeOrmModule.forFeature([StoryVersion])],
  providers: [VersionCleanupProcessor, VersionCleanupScheduler]
})
export class StoriesJobsModule {}
