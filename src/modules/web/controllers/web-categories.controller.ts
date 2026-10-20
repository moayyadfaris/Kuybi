import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { minutes, Throttle } from '@nestjs/throttler'

import { WebQueryDto } from '../dto/web-query.dto'
import { WebCategoriesService } from '../services/web-categories.service'

@ApiTags('Web - Public Categories')
@Controller('web/v1/categories')
@Throttle({ default: { limit: 100, ttl: minutes(15) } }) // applied by the global ThrottlerGuard
export class WebCategoriesController {
  constructor(private readonly webCategoriesService: WebCategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get active categories',
    description:
      'Public endpoint to retrieve active categories. No authentication required. Rate limited to 100 requests per 15 minutes.'
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, description: 'List of active categories' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async getActiveCategories(@Query() query: WebQueryDto) {
    return this.webCategoriesService.getActiveCategories(query)
  }

  @Get('tree')
  @ApiOperation({
    summary: 'Get every active category',
    description: 'All active categories by name, for navigation (categories are flat)'
  })
  @ApiResponse({ status: 200, description: 'Active categories' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async getCategoryTree() {
    return this.webCategoriesService.getAllActive()
  }

  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Get active category by slug',
    description: 'Public endpoint to retrieve a single active category by slug'
  })
  @ApiParam({ name: 'slug', description: 'Category slug', example: 'technology' })
  @ApiResponse({ status: 200, description: 'Category found' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async getActiveCategoryBySlug(@Param('slug') slug: string) {
    return this.webCategoriesService.getActiveCategoryBySlug(slug)
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get active category by ID',
    description: 'Public endpoint to retrieve a single active category by ID'
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category found' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async getActiveCategoryById(@Param('id', ParseUUIDPipe) id: string) {
    return this.webCategoriesService.getActiveCategoryById(id)
  }
}
