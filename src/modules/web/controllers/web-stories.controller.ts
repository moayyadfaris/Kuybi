import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'

import { WebStoriesQueryDto } from '../dto/web-query.dto'
import { WebStoriesService } from '../services/web-stories.service'

@ApiTags('Web - Public Stories')
@Controller('web/v1/stories')
@Throttle({ default: { limit: 100, ttl: 900000 } }) // 100 requests per 15 minutes
export class WebStoriesController {
  constructor(private readonly webStoriesService: WebStoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get published stories',
    description:
      'Public endpoint to retrieve published stories. No authentication required. Rate limited to 100 requests per 15 minutes.'
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'categorySlug', required: false, type: String })
  @ApiQuery({ name: 'tag', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'List of published stories' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async getPublishedStories(@Query() query: WebStoriesQueryDto) {
    return this.webStoriesService.getPublishedStories(query)
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get published story by ID',
    description: 'Public endpoint to retrieve a single published story by ID'
  })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story found' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async getPublishedStoryById(@Param('id', ParseIntPipe) id: number) {
    return this.webStoriesService.getPublishedStoryById(id)
  }
}
