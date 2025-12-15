import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'

import { CategoriesModule } from '@modules/categories/categories.module'
import { StoriesModule } from '@modules/stories/stories.module'

import { DatabaseModule } from '@core/database/database.module'

import { WebCategoriesController } from './controllers/web-categories.controller'
import { WebStoriesController } from './controllers/web-stories.controller'
import { WebCategoriesService } from './services/web-categories.service'
import { WebStoriesService } from './services/web-stories.service'

@Module({
  imports: [
    DatabaseModule,
    StoriesModule, // For StoryRepository
    CategoriesModule, // For CategoryRepository
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 900000, // 15 minutes in milliseconds
        limit: 100 // 100 requests per 15 minutes
      }
    ])
  ],
  controllers: [WebStoriesController, WebCategoriesController],
  providers: [WebStoriesService, WebCategoriesService],
  exports: [WebStoriesService, WebCategoriesService]
})
export class WebModule {}
