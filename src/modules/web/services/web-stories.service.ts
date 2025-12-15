import { Injectable, NotFoundException } from '@nestjs/common'

import { StoryStatus } from '@modules/stories/entities/story.entity'

import { StoryRepository } from '@core/database/repositories/story.repository'

import { WebStoriesQueryDto } from '../dto/web-query.dto'

@Injectable()
export class WebStoriesService {
  constructor(private readonly storyRepository: StoryRepository) {}

  /**
   * Get published stories for public consumption
   * Only returns published stories with sanitized data
   */
  async getPublishedStories(query: WebStoriesQueryDto) {
    const { search, page = 1, limit = 20 } = query

    const result = await this.storyRepository.search({
      status: StoryStatus.PUBLISHED,
      search,
      page,
      limit,
      sortBy: 'createdAt',
      sortOrder: 'DESC'
    })

    // Sanitize response - remove sensitive fields
    return {
      data: result.results.map((story) => this.sanitizeStory(story)),
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

    return this.sanitizeStory(story)
  }

  /**
   * Sanitize story data for public consumption
   * Removes internal fields and sensitive data
   */
  private sanitizeStory(story: any) {
    const {
      createdBy,
      updatedBy,
      deletedBy,
      deletedAt,
      version,
      metadata,
      ...publicData
    } = story

    return {
      ...publicData,
      // Only include safe metadata
      metadata: metadata
        ? {
            viewCount: metadata.viewCount || 0,
            featuredImageUrl: metadata.featuredImageUrl
          }
        : undefined
    }
  }
}
