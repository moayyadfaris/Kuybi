import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { plainToInstance } from 'class-transformer'

import { AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { GetUser, JwtAuthGuard, OptionalJwtAuthGuard } from '@core/auth'
import { Idempotent } from '@core/idempotency'

import {
  ContentListQueryDto,
  ContentListResponseDto,
  CreateContentDto,
  ResponseContentDto,
  ScheduleContentDto,
  UpdateContentDto
} from '../dto'
import { PostContent } from '../entities/post-content.entity'
import { ContentService } from '../services/content.service'
import { ContentAccessPolicy } from '../services/content-access.policy'

const toResponse = (content: PostContent) =>
  plainToInstance(ResponseContentDto, content, { excludeExtraneousValues: true })

/**
 * Entries of a post type. Reads are public (published entries of active types); a
 * signed-in user also sees the drafts and scheduled entries they may update, and
 * changes are checked against the entry (permissions may be limited to own entries).
 */
@ApiTags('Content')
@Controller('v1/content/:postTypeSlug')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly accessPolicy: ContentAccessPolicy
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List the entries of a post type' })
  @ApiParam({ name: 'postTypeSlug', description: 'Post type slug' })
  @ApiResponse({ status: 200, type: ContentListResponseDto })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  async findAll(
    @Param('postTypeSlug') postTypeSlug: string,
    @Query() query: ContentListQueryDto,
    @GetUser() viewer?: User
  ): Promise<ContentListResponseDto> {
    const postType = await this.contentService.postTypeFor(postTypeSlug, viewer)
    // Published entries, plus those the viewer may edit
    const { data, total } = await this.contentService.findAll(postType.id, viewer, {
      status: query.status,
      limit: query.limit,
      offset: query.offset,
      search: query.search,
      includeDeleted: query.includeDeleted
    })
    return { data: data.map(toResponse), total, limit: query.limit, offset: query.offset }
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get an entry by id' })
  @ApiResponse({ status: 200, type: ResponseContentDto })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async findOne(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() viewer?: User
  ): Promise<ResponseContentDto> {
    const postType = await this.contentService.postTypeFor(postTypeSlug, viewer)
    return toResponse(await this.contentService.findVisible(postType, id, viewer))
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get an entry by slug' })
  @ApiResponse({ status: 200, type: ResponseContentDto })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async findBySlug(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('slug') slug: string,
    @GetUser() viewer?: User
  ): Promise<ResponseContentDto> {
    const postType = await this.contentService.postTypeFor(postTypeSlug, viewer)
    return toResponse(await this.contentService.findVisibleBySlug(postType, slug, viewer))
  }

  @Post()
  @Idempotent()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Content })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an entry' })
  @ApiResponse({ status: 201, type: ResponseContentDto })
  @ApiResponse({ status: 400, description: 'Invalid data or field validation failed' })
  @ApiResponse({ status: 403, description: 'Publishing needs the Publish permission' })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  async create(
    @Param('postTypeSlug') postTypeSlug: string,
    @Body() dto: CreateContentDto,
    @GetUser() author: User
  ): Promise<ResponseContentDto> {
    const postType = await this.contentService.postTypeFor(postTypeSlug, author)
    const content = await this.contentService.create(
      postType,
      {
        title: dto.title,
        excerpt: dto.excerpt,
        fieldData: dto.field_data,
        status: dto.status,
        scheduledAt: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined
      },
      author
    )
    return toResponse(content)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Content })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an entry (field_data is merged into the stored values)' })
  @ApiResponse({ status: 200, type: ResponseContentDto })
  @ApiResponse({ status: 400, description: 'Invalid data or field validation failed' })
  @ApiResponse({ status: 403, description: 'Publishing needs the Publish permission' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async update(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentDto,
    @GetUser() editor: User
  ): Promise<ResponseContentDto> {
    const content = await this.load(postTypeSlug, id, editor, Action.Update)
    const updated = await this.contentService.update(
      content,
      {
        title: dto.title,
        excerpt: dto.excerpt,
        fieldData: dto.field_data,
        status: dto.status,
        scheduledAt: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined
      },
      editor
    )
    return toResponse(updated)
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Publish, subject: Subject.Content })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish an entry now' })
  @ApiResponse({ status: 200, type: ResponseContentDto })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async publish(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() editor: User
  ): Promise<ResponseContentDto> {
    const content = await this.load(postTypeSlug, id, editor, Action.Publish)
    return toResponse(await this.contentService.publish(content))
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Publish, subject: Subject.Content })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish an entry at a future time (checked every minute)' })
  @ApiResponse({ status: 200, type: ResponseContentDto })
  @ApiResponse({ status: 400, description: 'Date not in the future' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async schedule(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleContentDto,
    @GetUser() editor: User
  ): Promise<ResponseContentDto> {
    const content = await this.load(postTypeSlug, id, editor, Action.Publish)
    return toResponse(
      await this.contentService.schedule(content, new Date(dto.scheduledFor), editor)
    )
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.Content })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an entry (soft delete; its slug becomes free)' })
  @ApiResponse({ status: 204, description: 'Content deleted' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async remove(
    @Param('postTypeSlug') postTypeSlug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() editor: User
  ): Promise<void> {
    await this.contentService.remove(await this.load(postTypeSlug, id, editor, Action.Delete))
  }

  /** The entry, if the user may do `action` to it (404 when they may not see it, else 403) */
  private async load(
    postTypeSlug: string,
    id: string,
    editor: User,
    action: Action
  ): Promise<PostContent> {
    const postType = await this.contentService.postTypeFor(postTypeSlug, editor)
    const content = await this.contentService.findOfType(postType, id)
    this.accessPolicy.assertCanChange(editor, action, content)
    return content
  }
}
