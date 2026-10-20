import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'

import { AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { JwtAuthGuard } from '@core/auth'

import { UpdateStoryDto } from '../dto/update-story.dto'
import {
  BranchInfoDto,
  CompareVersionsDto,
  CreateBranchDto,
  CreateVersionDto,
  MergeVersionDto,
  RollbackVersionDto,
  TagVersionDto,
  VersionComparisonDto,
  VersionHistoryQueryDto,
  VersionResponseDto
} from '../dto/version'
import { Story } from '../entities/story.entity'
import { StoriesService } from '../services/stories.service'
import { StoryAccessPolicy } from '../services/story-access.policy'
import { StoryVersionService } from '../services/story-version.service'
import { StoryVersionBranchService } from '../services/versioning/story-version-branch.service'
import { toVersionResponseDto } from '../services/versioning/version-response.mapper'
import { storyContentOfVersion } from '../services/versioning/version-snapshot'

interface AuthenticatedRequest extends Request {
  user?: User
}

@ApiTags('Story Versions')
@Controller('v1/stories')
@UseGuards(JwtAuthGuard, AbilityGuard)
@ApiBearerAuth()
export class StoryVersionController {
  constructor(
    private readonly versionService: StoryVersionService,
    private readonly branchService: StoryVersionBranchService,
    private readonly storiesService: StoriesService,
    private readonly accessPolicy: StoryAccessPolicy
  ) {}

  /**
   * Version history is editorial: old versions keep content that was since removed and
   * the staff notes. Reading or changing it needs Update on the story itself (404 when the
   * user may not read the story, 403 when they may read but not edit it).
   */
  private async editableStory(storyId: number, req: AuthenticatedRequest): Promise<Story> {
    const user = this.viewer(req)
    const story = await this.storiesService.findOne(storyId)
    this.accessPolicy.assertCanChange(
      user,
      Action.Update,
      story,
      'You do not have access to the versions of this story'
    )
    return story
  }

  private viewer(req: AuthenticatedRequest): User {
    if (!req.user) throw new UnauthorizedException('User not authenticated')
    return req.user
  }

  /**
   * Get version history for a story
   */
  @Get(':storyId/versions')
  @CheckAbility({ action: Action.Read, subject: Subject.StoryVersion })
  @ApiOperation({
    summary: 'Get version history',
    description: 'Retrieve paginated version history for a story with optional branch filtering'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiResponse({
    status: 200,
    description: 'Version history retrieved successfully',
    type: [VersionResponseDto]
  })
  async getVersionHistory(
    @Req() req: AuthenticatedRequest,
    @Param('storyId', ParseIntPipe) storyId: number,
    @Query() query: VersionHistoryQueryDto
  ): Promise<VersionResponseDto[]> {
    await this.editableStory(storyId, req)
    const versions = await this.versionService.getVersionHistory(
      storyId,
      query.branchName,
      query.limit,
      query.offset
    )
    return versions.map(toVersionResponseDto)
  }

  /**
   * Get specific version
   */
  @Get(':storyId/versions/:versionNumber')
  @CheckAbility({ action: Action.Read, subject: Subject.StoryVersion })
  @ApiOperation({
    summary: 'Get specific version',
    description: 'Retrieve details of a specific version by version number'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiParam({ name: 'versionNumber', type: 'number', description: 'Version number' })
  @ApiResponse({
    status: 200,
    description: 'Version retrieved successfully',
    type: VersionResponseDto
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async getVersion(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @Req() req: AuthenticatedRequest
  ): Promise<VersionResponseDto> {
    await this.editableStory(storyId, req)
    const version = await this.versionService.getVersion(storyId, versionNumber)
    return toVersionResponseDto(version)
  }

  /**
   * Create manual version
   */
  @Post(':storyId/versions')
  @CheckAbility({ action: Action.Create, subject: Subject.StoryVersion })
  @ApiOperation({
    summary: 'Create manual version',
    description: 'Create a manual snapshot version of the current story state'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiResponse({
    status: 201,
    description: 'Version created successfully',
    type: VersionResponseDto
  })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async createVersion(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Body() dto: CreateVersionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<VersionResponseDto> {
    const story = await this.editableStory(storyId, req)
    const version = await this.versionService.createVersion(story, dto, this.viewer(req).id)
    return toVersionResponseDto(version)
  }

  /**
   * Rollback to previous version
   */
  @Post(':storyId/versions/rollback')
  @CheckAbility({ action: Action.Update, subject: Subject.StoryVersion })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rollback to version',
    description: 'Rollback story to a previous version, creating a new ROLLBACK version'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiResponse({
    status: 200,
    description: 'Story rolled back successfully',
    type: VersionResponseDto
  })
  @ApiResponse({ status: 404, description: 'Story or version not found' })
  async rollback(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Body() dto: RollbackVersionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<VersionResponseDto> {
    await this.editableStory(storyId, req)
    const user = this.viewer(req)
    const target = await this.versionService.getVersion(storyId, dto.versionNumber)

    // On main the story gets the old content back (through the usual update rules); a
    // rollback onto a new branch only records the version and leaves the story as it is
    if (!dto.createBranch) {
      const content = storyContentOfVersion(target)
      const restore: UpdateStoryDto = {
        title: content.title,
        details: content.details,
        type: content.type,
        priority: content.priority,
        fromTime: content.fromTime?.toISOString(),
        toTime: content.toTime?.toISOString(),
        latitude: content.latitude,
        longitude: content.longitude,
        address: content.address,
        city: content.city,
        region: content.region,
        countryId: content.countryId,
        metadata: content.metadata,
        internalNotes: content.internalNotes
      }
      await this.storiesService.update(storyId, restore, user, { recordVersion: false })
    }

    const version = await this.versionService.recordRollback(
      target,
      user.id,
      dto.commitMessage,
      dto.createBranch ? dto.branchName || `rollback-to-v${dto.versionNumber}` : 'main'
    )
    return toVersionResponseDto(version)
  }

  /**
   * Create branch
   */
  @Post(':storyId/versions/branch')
  @CheckAbility({ action: Action.Create, subject: Subject.StoryVersion })
  @ApiOperation({
    summary: 'Create branch',
    description: 'Create a new branch from a specific version or latest'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiResponse({
    status: 201,
    description: 'Branch created successfully',
    type: VersionResponseDto
  })
  @ApiResponse({ status: 404, description: 'Story or version not found' })
  @ApiResponse({ status: 400, description: 'Branch name already exists' })
  async createBranch(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Body() dto: CreateBranchDto,
    @Req() req: AuthenticatedRequest
  ): Promise<VersionResponseDto> {
    await this.editableStory(storyId, req)
    const version = await this.branchService.createBranch(
      storyId,
      dto.branchName,
      dto.fromVersionNumber,
      this.viewer(req).id,
      dto.commitMessage
    )
    return toVersionResponseDto(version)
  }

  /**
   * Merge branches
   */
  @Post(':storyId/versions/merge')
  @CheckAbility({ action: Action.Update, subject: Subject.StoryVersion })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Merge branches',
    description: 'Merge source branch into target branch with conflict detection'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiResponse({
    status: 200,
    description: 'Branches merged successfully',
    type: VersionResponseDto
  })
  @ApiResponse({ status: 404, description: 'Story or branch not found' })
  @ApiResponse({
    status: 409,
    description: 'Merge conflicts: send resolveConflicts with a value per field'
  })
  async mergeBranches(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Body() dto: MergeVersionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<VersionResponseDto> {
    await this.editableStory(storyId, req)
    const version = await this.branchService.mergeVersion(
      storyId,
      dto.fromBranch,
      dto.fromVersionNumber,
      dto.targetBranch,
      this.viewer(req).id,
      dto.commitMessage,
      dto.resolveConflicts
    )
    return toVersionResponseDto(version)
  }

  /**
   * Compare two versions
   */
  @Post(':storyId/versions/compare')
  @CheckAbility({ action: Action.Read, subject: Subject.StoryVersion })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compare versions',
    description: 'Compare two versions and return detailed diff'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiResponse({
    status: 200,
    description: 'Version comparison completed',
    type: VersionComparisonDto
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async compareVersions(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Body() dto: CompareVersionsDto,
    @Req() req: AuthenticatedRequest
  ): Promise<VersionComparisonDto> {
    await this.editableStory(storyId, req)
    const result = await this.branchService.compareVersions(storyId, dto.versionA, dto.versionB)

    return {
      versionA: toVersionResponseDto(result.versionA),
      versionB: toVersionResponseDto(result.versionB),
      diff: result.diff,
      changesCount: result.changesCount,
      changedFields: result.changedFields
    }
  }

  /**
   * Get branch information
   */
  @Get(':storyId/versions/branches/info')
  @CheckAbility({ action: Action.Read, subject: Subject.StoryVersion })
  @ApiOperation({
    summary: 'Get branch info',
    description: 'Get statistics and information for all branches'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiResponse({
    status: 200,
    description: 'Branch information retrieved successfully',
    type: [BranchInfoDto]
  })
  async getBranchInfo(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Req() req: AuthenticatedRequest
  ): Promise<BranchInfoDto[]> {
    await this.editableStory(storyId, req)
    return this.branchService.getBranchInfo(storyId)
  }

  /**
   * Tag a version
   */
  @Post(':storyId/versions/:versionNumber/tag')
  @CheckAbility({ action: Action.Update, subject: Subject.StoryVersion })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tag version',
    description: 'Add or update a tag on a specific version'
  })
  @ApiParam({ name: 'storyId', type: 'number', description: 'Story ID' })
  @ApiParam({ name: 'versionNumber', type: 'number', description: 'Version number to tag' })
  @ApiResponse({
    status: 200,
    description: 'Version tagged successfully',
    type: VersionResponseDto
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  @ApiResponse({ status: 400, description: 'Tag name already exists' })
  async tagVersion(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @Body() dto: TagVersionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<VersionResponseDto> {
    await this.editableStory(storyId, req)
    const version = await this.versionService.tagVersion(storyId, versionNumber, dto.tag)
    return toVersionResponseDto(version)
  }
}
