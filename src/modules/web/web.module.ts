import { Module } from '@nestjs/common'

import { CategoriesModule } from '@modules/categories'
import { StoriesModule } from '@modules/stories'

import { WebCategoriesController } from './controllers/web-categories.controller'
import { WebStoriesController } from './controllers/web-stories.controller'
import { WebCategoriesService } from './services/web-categories.service'
import { WebStoriesService } from './services/web-stories.service'

@Module({
  imports: [
    StoriesModule, // For StoryRepository
    CategoriesModule // For CategoryRepository
  ],
  controllers: [WebStoriesController, WebCategoriesController],
  providers: [WebStoriesService, WebCategoriesService],
  exports: [WebStoriesService, WebCategoriesService]
})
export class WebModule {}
