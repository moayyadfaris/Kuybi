import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { CategoriesModule } from '@modules/categories/categories.module'
import { CountriesModule } from '@modules/countries/countries.module'
import { TagsModule } from '@modules/tags/tags.module'
import { UsersModule } from '@modules/users/users.module'

import { CacheConfigModule } from '@core/cache/cache.module'
import { StoryRepository } from '@core/database/repositories/story.repository'
import { StoryVersionRepository } from '@core/database/repositories/story-version.repository'

import { AclModule } from '../acl/acl.module'
import { AttachmentsModule } from '../attachments/attachments.module'
import { Attachment } from '../attachments/entities/attachment.entity'

import { StoriesController } from './controllers/stories.controller'
import { StoryVersionController } from './controllers/story-version.controller'
import { Story } from './entities/story.entity'
import { StoryAttachment } from './entities/story-attachment.entity'
import { StoryTag } from './entities/story-tag.entity'
import { StoryVersion } from './entities/story-version.entity'
import { StoriesSeeder } from './seeders/stories.seeder'
import { StoriesService } from './services/stories.service'
import { StoryVersionService } from './services/story-version.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Story, StoryVersion, StoryAttachment, StoryTag, Attachment]),
    CacheConfigModule,
    AclModule,
    AttachmentsModule,
    UsersModule,
    CountriesModule,
    CategoriesModule,
    TagsModule
  ],

  controllers: [StoriesController, StoryVersionController],
  providers: [
    StoriesService,
    StoryVersionService,
    StoryRepository,
    StoryVersionRepository,
    StoriesSeeder
  ],

  exports: [StoriesService, StoryVersionService, StoryRepository, StoryVersionRepository]
})
export class StoriesModule {}
