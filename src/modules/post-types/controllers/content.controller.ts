import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { GetUser } from '@modules/auth/decorators/get-user.decorator'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { ContentService } from '../services/content.service'
import {
  CreateContentDto,
  UpdateContentDto,
  ScheduleContentDto,
  ResponseContentDto,
  ContentListResponseDto
} from '../dto'
import { plainToInstance } from 'class-transformer'
import { NotFoundException } from '@nestjs/common'

@ApiTags('Content')
@Controller('v1/content/:postTypeSlug')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  @ApiOperation({ summary: 'Get content list for a post type' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (1-100)',
    example: 20
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Offset for pagination',
    example: 0
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Full-text search query'
  })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    type: Boolean,
    description: 'Include deleted content in results',
    example: false
  })
  @ApiResponse({
    status: 200,
    description: 'Content list',
    type: ContentListResponseDto
  })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  async findAll(
    @Param('postTypeSlug') postTypeSlug: string,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
    @Query('search') search?: string,
    @Query('includeDeleted') includeDeleted?: string
  ): Promise<ContentListResponseDto> {
    // Validate limit
    const validLimit = Math.min(Math.max(limit || 20, 1), 100)

    // Parse includeDeleted boolean
    const shouldIncludeDeleted = includeDeleted === 'true' || includeDeleted === '1'

    // Get post type by slug to get its ID
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)

    const result = await this.contentService.findAll(postType.id, {
      status,
      limit: validLimit,
      offset: offset || 0,
      search,
      includeDeleted: shouldIncludeDeleted
    })

    return {
      data: plainToInstance(ResponseContentDto, result.data, {
        excludeExtraneousValues: true
      }),
      total: result.total,
      limit: validLimit,
      offset: offset || 0
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get content by ID' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiResponse({
    status: 200,
    description: 'Content found',
    type: ResponseContentDto
  })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async findOne(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ResponseContentDto> {
    const content = await this.contentService.findOne(id)
    // Verify content belongs to the specified post type
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    if (content.postTypeId !== postType.id) {
      throw new NotFoundException('Content not found for this post type')
    }
    return plainToInstance(ResponseContentDto, content, {
      excludeExtraneousValues: true
    })
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get content by slug' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiParam({ name: 'slug', description: 'Content slug' })
  @ApiResponse({
    status: 200,
    description: 'Content found',
    type: ResponseContentDto
  })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async findBySlug(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('slug') slug: string
  ): Promise<ResponseContentDto> {
    // Get post type by slug to get its ID
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    const content = await this.contentService['postContentRepository'].findBySlug(postType.id, slug)
    
    if (!content || content.deletedAt) {
      throw new NotFoundException('Content not found')
    }

    return plainToInstance(ResponseContentDto, content, {
      excludeExtraneousValues: true
    })
  }

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Content })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new content' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiResponse({
    status: 201,
    description: 'Content created',
    type: ResponseContentDto
  })
  @ApiResponse({ status: 400, description: 'Invalid data or validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async create(
    @Param('postTypeSlug') postTypeSlug: string,
    @Body() createContentDto: CreateContentDto,
    @GetUser('id') authorId: string
  ): Promise<ResponseContentDto> {
    // Get post type by slug to get its ID
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    
    // Map field_data to fieldData for service
    const serviceData = {
      title: createContentDto.title,
      slug: createContentDto.title, // Will be generated if needed
      excerpt: createContentDto.excerpt,
      fieldData: createContentDto.field_data,
      status: createContentDto.status,
      scheduledAt: createContentDto.scheduledFor ? new Date(createContentDto.scheduledFor) : undefined
    }
    
    const content = await this.contentService.create(postType.id, serviceData, authorId)
    return plainToInstance(ResponseContentDto, content, {
      excludeExtraneousValues: true
    })
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Content })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update content' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiResponse({
    status: 200,
    description: 'Content updated',
    type: ResponseContentDto
  })
  @ApiResponse({ status: 400, description: 'Invalid data or validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async update(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateContentDto: UpdateContentDto,
    @GetUser('id') updatedBy: string
  ): Promise<ResponseContentDto> {
    // Verify content belongs to post type
    const content = await this.contentService.findOne(id)
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    if (content.postTypeId !== postType.id) {
      throw new NotFoundException('Content not found for this post type')
    }

    // Map field_data to fieldData for service
    const serviceData: any = {}
    if (updateContentDto.title) serviceData.title = updateContentDto.title
    if (updateContentDto.excerpt) serviceData.excerpt = updateContentDto.excerpt
    if (updateContentDto.field_data) serviceData.fieldData = updateContentDto.field_data
    if (updateContentDto.status) serviceData.status = updateContentDto.status
    if (updateContentDto.scheduledFor) serviceData.scheduledAt = new Date(updateContentDto.scheduledFor)

    const updated = await this.contentService.update(id, serviceData, updatedBy)
    return plainToInstance(ResponseContentDto, updated, {
      excludeExtraneousValues: true
    })
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Publish, subject: Subject.Content })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish content' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiResponse({
    status: 200,
    description: 'Content published',
    type: ResponseContentDto
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async publish(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ResponseContentDto> {
    // Verify content belongs to post type
    const content = await this.contentService.findOne(id)
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    if (content.postTypeId !== postType.id) {
      throw new NotFoundException('Content not found for this post type')
    }

    const published = await this.contentService.publish(id)
    return plainToInstance(ResponseContentDto, published, {
      excludeExtraneousValues: true
    })
  }

  @Post(':id/schedule')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Content })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Schedule content publication' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiResponse({
    status: 200,
    description: 'Content scheduled',
    type: ResponseContentDto
  })
  @ApiResponse({ status: 400, description: 'Invalid date' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async schedule(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() scheduleContentDto: ScheduleContentDto
  ): Promise<ResponseContentDto> {
    // Verify content belongs to post type
    const content = await this.contentService.findOne(id)
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    if (content.postTypeId !== postType.id) {
      throw new NotFoundException('Content not found for this post type')
    }

    const scheduled = await this.contentService.schedule(id, scheduleContentDto.scheduledFor)
    return plainToInstance(ResponseContentDto, scheduled, {
      excludeExtraneousValues: true
    })
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.Content })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete content' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiParam({ name: 'id', description: 'Content ID' })
  @ApiResponse({ status: 204, description: 'Content deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async remove(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    // Verify content belongs to post type
    const content = await this.contentService.findOne(id)
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    if (content.postTypeId !== postType.id) {
      throw new NotFoundException('Content not found for this post type')
    }

    await this.contentService.remove(id)
  }
}
