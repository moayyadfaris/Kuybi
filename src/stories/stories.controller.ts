import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger'
import { Request } from 'express'
import { StoriesService } from './stories.service'
import {
  CreateStoryDto,
  UpdateStoryDto,
  StoryFilterDto,
  AttachAttachmentsDto,
  AttachTagsDto,
  DetachAttachmentsDto,
  DetachTagsDto,
  AttachCategoriesDto,
  DetachCategoriesDto,
} from './dto'
import { StoryStatus, StoryType } from './entities/story.entity'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AbilityGuard } from '../acl/abilities/ability.guard'
import { CheckAbility } from '../acl/abilities/ability.decorator'
import { Action } from '../acl/types/actions.enum'
import { Subject } from '../acl/types/subjects.enum'

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    email: string
    role?: string
  }
}

@ApiTags('Stories')
@Controller('v1/stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new story' })
  @ApiResponse({ status: 201, description: 'Story created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  create(@Body() createStoryDto: CreateStoryDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.create(createStoryDto, userId)
  }

  @Get()
  @ApiOperation({ summary: 'Get all stories with filters and pagination' })
  @ApiResponse({ status: 200, description: 'List of stories with pagination' })
  findAll(@Query() filterDto: StoryFilterDto) {
    return this.storiesService.findAll(filterDto)
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get story statistics' })
  @ApiResponse({ status: 200, description: 'Story statistics' })
  getStats() {
    return this.storiesService.getStats()
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get stories by user ID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiQuery({ name: 'includeDeleted', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of user stories' })
  findByUser(
    @Param('userId') userId: string,
    @Query('includeDeleted') includeDeleted?: boolean,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ) {
    return this.storiesService.findByUser(userId, { includeDeleted, limit, page })
  }

  @Get('status/:status')
  @ApiOperation({ summary: 'Get stories by status' })
  @ApiParam({ name: 'status', enum: StoryStatus, description: 'Story status' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of stories with specified status' })
  findByStatus(
    @Param('status') status: StoryStatus,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ) {
    return this.storiesService.findByStatus(status, { limit, page })
  }

  @Get('type/:type')
  @ApiOperation({ summary: 'Get stories by type' })
  @ApiParam({ name: 'type', enum: StoryType, description: 'Story type' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of stories with specified type' })
  findByType(
    @Param('type') type: StoryType,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ) {
    return this.storiesService.findByType(type, { limit, page })
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'Get child stories (threaded stories)' })
  @ApiParam({ name: 'id', description: 'Parent story ID' })
  @ApiQuery({ name: 'includeDeleted', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of child stories' })
  @ApiResponse({ status: 404, description: 'Parent story not found' })
  findChildren(
    @Param('id', ParseIntPipe) id: number,
    @Query('includeDeleted') includeDeleted?: boolean,
  ) {
    return this.storiesService.findChildren(id, includeDeleted)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get story by ID' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Story found' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.userId
    return this.storiesService.findOne(id, userId)
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
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.update(id, updateStoryDto, userId, req.user?.role)
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
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.updateStatus(id, status, userId)
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
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.remove(id, userId, reason, req.user?.role)
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
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.hardDelete(id, userId, req.user?.role)
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
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.restore(id, userId, req.user?.role)
  }

  // Attachment management endpoints
  @Post(':id/attachments')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Attach attachments to story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Attachments attached successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 400, description: 'One or more attachments not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  attachAttachments(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachAttachmentsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.attachAttachments(id, dto, userId, req.user?.role)
  }

  @Delete(':id/attachments')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Detach attachments from story' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'Attachments detached successfully' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the story owner' })
  detachAttachments(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DetachAttachmentsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.detachAttachments(id, dto, userId, req.user?.role)
  }

  @Get(':id/attachments')
  @ApiOperation({ summary: 'Get story attachments' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'List of attachments' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  getAttachments(@Param('id', ParseIntPipe) id: number) {
    return this.storiesService.getAttachments(id)
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
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.attachTags(id, dto, userId, req.user?.role)
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
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.detachTags(id, dto, userId, req.user?.role)
  }

  @Get(':id/tags')
  @ApiOperation({ summary: 'Get story tags' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'List of tags' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  getTags(@Param('id', ParseIntPipe) id: number) {
    return this.storiesService.getTags(id)
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
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.attachCategories(id, dto, userId, req.user?.role)
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
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.userId
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.storiesService.detachCategories(id, dto, userId, req.user?.role)
  }

  @Get(':id/categories')
  @ApiOperation({ summary: 'Get story categories' })
  @ApiParam({ name: 'id', description: 'Story ID' })
  @ApiResponse({ status: 200, description: 'List of categories' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  getCategories(@Param('id', ParseIntPipe) id: number) {
    return this.storiesService.getCategories(id)
  }
}
