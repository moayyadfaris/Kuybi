import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { plainToInstance } from 'class-transformer'
import { Request } from 'express'

import { AbilityFactory, AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { GetUser, JwtAuthGuard, OptionalJwtAuthGuard } from '@core/auth'
import { Idempotent } from '@core/idempotency'

import {
  ContentListResponseDto,
  CreateContentDto,
  ResponseContentDto,
  ScheduleContentDto,
  UpdateContentDto
} from '../dto'
import { PostContent } from '../entities/post-content.entity'
import { ContentStatus } from '../enums/content-status.enum'
import { ContentService } from '../services/content.service'

@ApiTags('Content')
@Controller('v1/content/:postTypeSlug')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly abilityFactory: AbilityFactory
  ) {}

  /** Editors (Update on content) see drafts, scheduled and deleted entries; others only published */
  private canSeeUnpublished(req: Request): boolean {
    const user = req.user as User | undefined
    return !!user && this.abilityFactory.createForUser(user).can(Action.Update, Subject.Content)
  }

  private assertVisible(content: PostContent, req: Request): void {
    if (content.status !== ContentStatus.PUBLISHED && !this.canSeeUnpublished(req)) {
      // Same answer as a missing entry: unpublished content does not exist publicly
      throw new NotFoundException('Content not found')
    }
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
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
    @Query('includeDeleted') includeDeleted?: string,
    @Req() req?: Request
  ): Promise<ContentListResponseDto> {
    // Validate limit
    const validLimit = Math.min(Math.max(limit || 20, 1), 100)

    // Parse includeDeleted boolean
    const shouldIncludeDeleted = includeDeleted === 'true' || includeDeleted === '1'

    // Get post type by slug to get its ID
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)

    // Status and deleted filters are for editors; everyone else sees published entries only
    const editor = !!req && this.canSeeUnpublished(req)
    const result = await this.contentService.findAll(postType.id, {
      status: editor ? status : ContentStatus.PUBLISHED,
      limit: validLimit,
      offset: offset || 0,
      search,
      includeDeleted: editor && shouldIncludeDeleted
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
  @UseGuards(OptionalJwtAuthGuard)
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
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ): Promise<ResponseContentDto> {
    const content = await this.contentService.findOne(id)
    // Verify content belongs to the specified post type
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    if (content.postTypeId !== postType.id) {
      throw new NotFoundException('Content not found for this post type')
    }
    this.assertVisible(content, req)
    return plainToInstance(ResponseContentDto, content, {
      excludeExtraneousValues: true
    })
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
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
    @Param('slug') slug: string,
    @Req() req: Request
  ): Promise<ResponseContentDto> {
    // Get post type by slug to get its ID
    const postType = await this.contentService['postTypesService'].findBySlug(postTypeSlug)
    const content = await this.contentService['postContentRepository'].findBySlug(postType.id, slug)

    if (!content || content.deletedAt) {
      throw new NotFoundException('Content not found')
    }
    this.assertVisible(content, req)

    return plainToInstance(ResponseContentDto, content, {
      excludeExtraneousValues: true
    })
  }

  @Post()
  @Idempotent()
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
      excerpt: createContentDto.excerpt,
      fieldData: createContentDto.field_data,
      status: createContentDto.status,
      scheduledAt: createContentDto.scheduledFor
        ? new Date(createContentDto.scheduledFor)
        : undefined
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
    const serviceData: Parameters<ContentService['update']>[1] = {}
    if (updateContentDto.title) serviceData.title = updateContentDto.title
    if (updateContentDto.excerpt) serviceData.excerpt = updateContentDto.excerpt
    if (updateContentDto.field_data) serviceData.fieldData = updateContentDto.field_data
    if (updateContentDto.status) serviceData.status = updateContentDto.status
    if (updateContentDto.scheduledFor)
      serviceData.scheduledAt = new Date(updateContentDto.scheduledFor)

    const updated = await this.contentService.update(id, serviceData, updatedBy)
    return plainToInstance(ResponseContentDto, updated, {
      excludeExtraneousValues: true
    })
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
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
