import { Module } from '@nestjs/common'

import { AttachmentsModule } from '@modules/attachments'
import { CategoriesModule } from '@modules/categories'
import { StoriesModule } from '@modules/stories'

import { WebCategoriesController } from './controllers/web-categories.controller'
import { WebStoriesController } from './controllers/web-stories.controller'
import { WebCategoriesService } from './services/web-categories.service'
import { WebStoriesService } from './services/web-stories.service'
import { WebPresenter } from './web.presenter'

/** The public site's read-only API (/api/web/v1), unauthenticated and rate limited */
@Module({
  imports: [StoriesModule, CategoriesModule, AttachmentsModule],
  controllers: [WebStoriesController, WebCategoriesController],
  providers: [WebStoriesService, WebCategoriesService, WebPresenter]
})
export class WebModule {}
