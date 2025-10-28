import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { StoriesService } from './stories.service'
import { StoriesController } from './stories.controller'
import { Story } from './entities/story.entity'
import { StoryAttachment } from './entities/story-attachment.entity'
import { StoryTag } from './entities/story-tag.entity'
import { Attachment } from '../attachments/entities/attachment.entity'
import { Tag } from '../tags/entities/tag.entity'
import { Category } from '../categories/entities/category.entity'
import { StoryRepository } from '@core/database/repositories/story.repository'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { CacheConfigModule } from '@core/cache/cache.module'
import { AclModule } from '../acl/acl.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Story, StoryAttachment, StoryTag, Attachment, Tag, Category]),
    CacheConfigModule,
    AclModule,
  ],
  controllers: [StoriesController],
  providers: [StoriesService, StoryRepository, TagRepository],
  exports: [StoriesService, StoryRepository, TagRepository],
})
export class StoriesModule {}
