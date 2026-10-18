import { Injectable, NotFoundException } from '@nestjs/common'

import { StoryRepository } from '@modules/stories'
import { StoryStatus } from '@modules/stories/entities'

import { WebStoriesQueryDto } from '../dto/web-query.dto'
import { toPublicStory } from '../web-response.mapper'

@Injectable()
export class WebStoriesService {
  constructor(private readonly storyRepository: StoryRepository) {}

  /**
   * Get published stories for public consumption
   * Only returns published stories with sanitized data
   */
  async getPublishedStories(query: WebStoriesQueryDto) {
    const { search, categorySlug, tag, page = 1, limit = 20 } = query

    const result = await this.storyRepository.search({
      status: StoryStatus.PUBLISHED,
      search,
      categorySlug,
      tagName: tag,
      page,
      limit,
      sortBy: 'createdAt',
      sortOrder: 'DESC'
    })

    // Sanitize response - remove sensitive fields
    return {
      data: result.results.map(story => toPublicStory(story)),
      total: result.total,
      page: result.pagination.page,
      limit: result.pagination.limit,
      totalPages: result.pagination.totalPages
    }
  }

  /**
   * Get a single published story by ID
   */
  async getPublishedStoryById(id: number) {
    const story = await this.storyRepository.findById(id)

    if (!story) {
      throw new NotFoundException('Story not found')
    }

    if (story.status !== StoryStatus.PUBLISHED) {
      throw new NotFoundException('Story not found')
    }

    return toPublicStory(story)
  }
}
