import { Injectable, NotFoundException } from '@nestjs/common'

import type { RecordScope } from '@modules/acl'
import { StoryRepository } from '@modules/stories'
import { StoryStatus } from '@modules/stories/entities'

import { WebStoriesQueryDto } from '../dto/web-query.dto'
import { WebPresenter } from '../web.presenter'

/** The public site shows published stories only */
const PUBLISHED_ONLY: RecordScope = { all: false, anyOf: [{ status: StoryStatus.PUBLISHED }] }

/** Published stories for the public site, newest first, in the public shape */
@Injectable()
export class WebStoriesService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly presenter: WebPresenter
  ) {}

  async getPublishedStories(query: WebStoriesQueryDto) {
    const result = await this.storyRepository.search({
      scope: PUBLISHED_ONLY,
      search: query.search,
      categorySlug: query.categorySlug,
      tagName: query.tag,
      page: query.page,
      limit: query.limit,
      sortBy: 'createdAt',
      sortOrder: 'DESC'
    })
    return {
      data: result.results.map(story => this.presenter.story(story)),
      total: result.total,
      page: result.pagination.page,
      limit: result.pagination.limit,
      totalPages: result.pagination.totalPages
    }
  }

  async getPublishedStoryById(id: number) {
    const story = await this.storyRepository.findById(id)
    if (!story || story.deletedAt || story.status !== StoryStatus.PUBLISHED) {
      throw new NotFoundException('Story not found')
    }
    return this.presenter.story(story)
  }
}
