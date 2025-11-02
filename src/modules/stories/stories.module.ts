import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { StoriesService } from './services/stories.service'
import { StoryVersionService } from './services/story-version.service'
import { StoriesController } from './controllers/stories.controller'
import { StoryVersionController } from './controllers/story-version.controller'
import { VersionCleanupJob } from './jobs/version-cleanup.job'
import { Story } from './entities/story.entity'
import { StoryVersion } from './entities/story-version.entity'
import { StoryAttachment } from './entities/story-attachment.entity'
import { StoryTag } from './entities/story-tag.entity'
import { Attachment } from '../attachments/entities/attachment.entity'
import { Tag } from '../tags/entities/tag.entity'
import { Category } from '../categories/entities/category.entity'
import { StoryRepository } from '@core/database/repositories/story.repository'
import { StoryVersionRepository } from '@core/database/repositories/story-version.repository'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { CacheConfigModule } from '@core/cache/cache.module'
import { AclModule } from '../acl/acl.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Story,
      StoryVersion,
      StoryAttachment,
      StoryTag,
      Attachment,
      Tag,
      Category
    ]),
    CacheConfigModule,
    AclModule
  ],
  controllers: [StoriesController, StoryVersionController],
  providers: [
    StoriesService,
    StoryVersionService,
    VersionCleanupJob,
    StoryRepository,
    StoryVersionRepository,
    TagRepository
  ],
  exports: [
    StoriesService,
    StoryVersionService,
    StoryRepository,
    StoryVersionRepository,
    TagRepository
  ]
})
export class StoriesModule {}


