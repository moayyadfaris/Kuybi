import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger'
import { Request } from 'express'

import { AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { JwtAuthGuard } from '@core/auth'
import { Idempotent } from '@core/idempotency'

import {
  AttachAttachmentsDto,
  AttachCategoriesDto,
  AttachTagsDto,
  CreateStoryDto,
  DetachAttachmentsDto,
  DetachCategoriesDto,
  DetachTagsDto,
  StoryFilterDto,
  UpdateStoryDto
} from '../dto'
import { UpdateStoryMainImageDto } from '../dto/update-story-main-image.dto'
import { Story, StoryStatus, StoryType } from '../entities/story.entity'
import { StoriesService } from '../services/stories.service'
import { StoryLifecycleService } from '../services/story-lifecycle.service'
import { StoryMediaService } from '../services/story-media.service'
import { StoryRelationshipService } from '../services/story-relationship.service'

interface AuthenticatedRequest extends Request {
  user?: User
}

@ApiTags('Stories - Admin')
@Controller('v1/stories')
@UseGuards(JwtAuthGuard, AbilityGuard)
@ApiBearerAuth()
export class StoriesController {
  constructor(
    private readonly storiesService: StoriesService,
    private readonly storyLifecycleService: StoryLifecycleService,
    private readonly storyMediaService: StoryMediaService,
    private readonly storyRelationshipService: StoryRelationshipService
  ) {}

  @Post()
  @Idempotent()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new story' })
  @ApiResponse({ status: 201, description: 'Story created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  create(@Body() createStoryDto: CreateStoryDto, @Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException()
    return this.storiesService.create(createStoryDto, req.user)
  }

  @Get()
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get all stories with filters and pagination' })
  @ApiResponse({ status: 200, description: 'List of stories with pagination' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  findAll(@Query() filterDto: StoryFilterDto, @Req() req: AuthenticatedRequest) {
    return this.storiesService.findAll(filterDto, this.viewer(req))
  }

  @Get('stats')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get story statistics' })
  @ApiResponse({ status: 200, description: 'Story statistics' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  getStats(@Req() req: AuthenticatedRequest) {
    return this.storiesService.getStats(this.viewer(req))
  }

  @Get('user/:userId')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get stories by user ID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiQuery({ name: 'includeDeleted', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of user stories' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  findByUser(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Query('includeDeleted') includeDeleted?: boolean,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number
  ) {
    return this.storiesService.findByUser(userId, this.viewer(req), { includeDeleted, limit, page })
  }

  @Get('status/:status')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get stories by status' })
  @ApiParam({ name: 'status', enum: StoryStatus, description: 'Story status' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of stories with specified status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  findByStatus(
    @Req() req: AuthenticatedRequest,
    @Param('status') status: StoryStatus,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number
  ) {
    return this.storiesService.findByStatus(status, this.viewer(req), { limit, page })
  }

  @Get('type/:type')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get stories by type' })
  @ApiParam({ name: 'type', enum: StoryType, description: 'Story type' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of stories with specified type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  findByType(
    @Req() req: AuthenticatedRequest,
    @Param('type') type: StoryType,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number
  ) {
    return this.storiesService.findByType(type, this.viewer(req), { limit, page })
  }

  @Get(':id/children')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get child stories (threaded stories)' })
  @ApiParam({ name: 'id', description: 'Parent story ID' })
  @ApiQuery({ name: 'includeDeleted', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of child stories' })
  @ApiResponse({ status: 404, description: 'Parent story not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  findChildren(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('includeDeleted') includeDeleted?: boolean
  ) {
    return this.storiesService.findChildren(id, this.viewer(req), includeDeleted)
  }

  @Get(':id')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get story by ID' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story found' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.storiesService.findVisible(id, this.viewer(req))
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story updated successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStoryDto: UpdateStoryDto,
    @Req() req: AuthenticatedRequest
  ) {
    if (!req.user) throw new UnauthorizedException()
    return this.storiesService.update(id, updateStoryDto, req.user)
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Publish, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update story status (publish/archive)' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story status updated successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires publish permission' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: StoryStatus,
    @Req() req: AuthenticatedRequest
  ) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyLifecycleService.updateStatus(id, status, req.user)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.Story })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiQuery({ name: 'reason', required: false, description: 'Deletion reason' })
  @ApiResponse({ status: 204, description: 'Story deleted successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason: string,
    @Req() req: AuthenticatedRequest
  ) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyLifecycleService.remove(id, req.user, reason)
  }

  @Delete(':id/hard')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Manage, subject: Subject.All })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a story (admin only)' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 204, description: 'Story permanently deleted' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  hardDelete(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyLifecycleService.hardDelete(id, req.user)
  }

  @Post(':id/restore')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Restore, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore a soft-deleted story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story restored successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 400, description: 'Story is not deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  restore(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyLifecycleService.restore(id, req.user)
  }

  // Attachment management endpoints
  @Post(':id/attachments')
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiOperation({ summary: 'Attach attachments to story' })
  @ApiResponse({ status: 200, description: 'Attachments attached successfully', type: Story })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 400, description: 'One or more attachments not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  attachAttachments(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachAttachmentsDto,
    @Req() req: AuthenticatedRequest
  ): Promise<Story> {
    if (!req.user) throw new UnauthorizedException()
    return this.storyRelationshipService.attachAttachments(id, dto, req.user)
  }

  @Delete(':id/attachments')
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiOperation({ summary: 'Detach attachments from story' })
  @ApiResponse({ status: 200, description: 'Attachments detached successfully', type: Story })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  detachAttachments(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DetachAttachmentsDto,
    @Req() req: AuthenticatedRequest
  ): Promise<Story> {
    if (!req.user) throw new UnauthorizedException()
    return this.storyRelationshipService.detachAttachments(id, dto, req.user)
  }

  @Get(':id/attachments')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get story attachments' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'List of attachments' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  getAttachments(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.storyRelationshipService.getAttachments(id, this.viewer(req))
  }

  // Tag management endpoints
  @Post(':id/tags')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attach tags to story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Tags attached successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 400, description: 'One or more tags not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  attachTags(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachTagsDto,
    @Req() req: AuthenticatedRequest
  ) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyRelationshipService.attachTags(id, dto, req.user)
  }

  @Delete(':id/tags')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detach tags from story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Tags detached successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  detachTags(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DetachTagsDto,
    @Req() req: AuthenticatedRequest
  ) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyRelationshipService.detachTags(id, dto, req.user)
  }

  @Get(':id/tags')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get story tags' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'List of tags' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  getTags(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.storyRelationshipService.getTags(id, this.viewer(req))
  }

  // Category management endpoints
  @Post(':id/categories')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attach categories to story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Categories attached successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 400, description: 'One or more categories not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  attachCategories(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachCategoriesDto,
    @Req() req: AuthenticatedRequest
  ) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyRelationshipService.attachCategories(id, dto, req.user)
  }

  @Delete(':id/categories')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detach categories from story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Categories detached successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  detachCategories(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DetachCategoriesDto,
    @Req() req: AuthenticatedRequest
  ) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyRelationshipService.detachCategories(id, dto, req.user)
  }

  @Get(':id/categories')
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  @ApiOperation({ summary: 'Get story categories' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  getCategories(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    return this.storyRelationshipService.getCategories(id, this.viewer(req))
  }

  @Put(':id/main-image')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update story main image' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiBody({ type: UpdateStoryMainImageDto })
  @ApiResponse({ status: 200, description: 'Main image updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid attachment or not an image' })
  @ApiResponse({ status: 404, description: 'Story or attachment not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - attachment does not belong to user' })
  updateMainImage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStoryMainImageDto,
    @Req() req: AuthenticatedRequest
  ) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyMediaService.updateMainImage(id, dto.attachmentId, req.user)
  }

  @Delete(':id/main-image')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove story main image' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Main image removed successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  removeMainImage(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException()
    return this.storyMediaService.removeMainImage(id, req.user)
  }

  /** The signed-in user, whose permissions decide which stories they can read */
  private viewer(req: AuthenticatedRequest): User {
    if (!req.user) throw new UnauthorizedException('User not authenticated')
    return req.user
  }
}
