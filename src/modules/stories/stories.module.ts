import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AclModule } from '@modules/acl'
import { AttachmentsModule } from '@modules/attachments'
import { Attachment } from '@modules/attachments/entities'
import { CategoriesModule } from '@modules/categories'
import { CountriesModule } from '@modules/countries'
import { TagsModule } from '@modules/tags'
import { UsersModule } from '@modules/users'

import { CacheConfigModule } from '@core/cache/cache.module'
import { MetricsModule } from '@core/observability/metrics.module'

import { StoriesController } from './controllers/stories.controller'
import { StoryVersionController } from './controllers/story-version.controller'
import { Story } from './entities/story.entity'
import { StoryVersion } from './entities/story-version.entity'
import { StoryRepository } from './repositories/story.repository'
import { StoryVersionRepository } from './repositories/story-version.repository'
import { StoriesSeeder } from './seeders/stories.seeder'
import { StoriesService } from './services/stories.service'
import { StoryAccessPolicy } from './services/story-access.policy'
import { StoryEnrichmentService } from './services/story-enrichment.service'
import { StoryLifecycleService } from './services/story-lifecycle.service'
import { StoryMediaService } from './services/story-media.service'
import { StoryRelationshipService } from './services/story-relationship.service'
import { StoryVersionService } from './services/story-version.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Story, StoryVersion, Attachment]),
    CacheConfigModule,
    MetricsModule,
    AclModule,
    AttachmentsModule,
    UsersModule,
    CountriesModule,
    CategoriesModule,
    TagsModule
  ],

  controllers: [StoriesController, StoryVersionController],
  providers: [
    StoryLifecycleService,
    StoryMediaService,
    StoryAccessPolicy,
    StoriesService,
    StoryVersionService,
    StoryRepository,
    StoryVersionRepository,
    StoriesSeeder,
    StoryRelationshipService,
    StoryEnrichmentService
  ],

  exports: [
    StoriesService,
    StoryVersionService,
    StoryRepository,
    StoryVersionRepository,
    StoryRelationshipService,
    StoryEnrichmentService
  ]
})
export class StoriesModule {}
