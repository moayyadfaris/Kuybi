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
import { Request } from 'express'

import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'

import { UpdateStoryDto } from '../dto/update-story.dto'
import { BranchInfoDto, VersionComparisonDto, VersionResponseDto } from '../dto/version'
import { CompareVersionsDto } from '../dto/version/compare-versions.dto'
import { CreateBranchDto } from '../dto/version/create-branch.dto'
import { CreateVersionDto } from '../dto/version/create-version.dto'
import { MergeVersionDto } from '../dto/version/merge-version.dto'
import { RollbackVersionDto } from '../dto/version/rollback-version.dto'
import { StoriesService } from '../services/stories.service'
import { StoryVersionService } from '../services/story-version.service'

interface ControllerUser {
  id?: string
  userId?: string
  email?: string
  role?: string
}

interface AuthenticatedRequest extends Request {
  user?: ControllerUser
}

@ApiTags('Story Versions')
@Controller('v1/stories')
@UseGuards(JwtAuthGuard, AbilityGuard)
@ApiBearerAuth()
export class StoryVersionController {
  constructor(
    private readonly versionService: StoryVersionService,
    private readonly storiesService: StoriesService
  ) {}

  private getUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.userId || req.user?.id
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return userId
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
  @ApiQuery({
    name: 'limit',
    required: false,
    type: 'number',
    description: 'Items per page (max 100)'
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: 'number',
    description: 'Offset for pagination'
  })
  @ApiQuery({
    name: 'branchName',
    required: false,
    type: 'string',
    description: 'Filter by branch name'
  })
  @ApiResponse({
    status: 200,
    description: 'Version history retrieved successfully',
    type: [VersionResponseDto]
  })
  async getVersionHistory(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('branchName') branchName?: string
  ): Promise<VersionResponseDto[]> {
    const versions = await this.versionService.getVersionHistory(storyId, branchName, limit, offset)
    return versions.map(v => this.versionService.toResponseDto(v))
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
    @Param('versionNumber', ParseIntPipe) versionNumber: number
  ): Promise<VersionResponseDto> {
    const version = await this.versionService.getVersion(storyId, versionNumber)
    return this.versionService.toResponseDto(version)
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
    const userId = this.getUserId(req)
    const story = await this.storiesService.findOne(storyId)
    const version = await this.versionService.createVersion(story, dto, userId)
    return this.versionService.toResponseDto(version)
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
    const userId = this.getUserId(req)
    const commitMessage = dto.commitMessage || `Rollback to version ${dto.versionNumber}`

    // Perform rollback and get restored content
    const { version, restoredContent } = await this.versionService.rollbackToVersion(
      storyId,
      dto.versionNumber,
      userId,
      commitMessage,
      dto.createBranch || false,
      dto.branchName
    )

    // Apply the restored content to the actual story
    // Only include fields that UpdateStoryDto accepts, transforming as needed
    const updateDto: UpdateStoryDto = {
      title: restoredContent.title,
      details: restoredContent.details,
      type: restoredContent.type,
      status: restoredContent.status,
      priority: restoredContent.priority,
      fromTime: restoredContent.fromTime?.toISOString(),
      toTime: restoredContent.toTime?.toISOString(),
      latitude: restoredContent.latitude,
      longitude: restoredContent.longitude,
      address: restoredContent.address,
      city: restoredContent.city,
      region: restoredContent.region,
      countryId: restoredContent.countryId,
      metadata: restoredContent.metadata,
      internalNotes: restoredContent.internalNotes
    }
    await this.storiesService.update(storyId, updateDto, userId)

    return this.versionService.toResponseDto(version)
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
    const userId = this.getUserId(req)
    const version = await this.versionService.createBranch(
      storyId,
      dto.branchName,
      dto.fromVersionNumber,
      userId,
      dto.commitMessage
    )
    return this.versionService.toResponseDto(version)
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
    description: 'Merge conflicts detected - manual resolution required'
  })
  async mergeBranches(
    @Param('storyId', ParseIntPipe) storyId: number,
    @Body() dto: MergeVersionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<VersionResponseDto> {
    const userId = this.getUserId(req)
    const version = await this.versionService.mergeVersion(
      storyId,
      dto.fromBranch,
      dto.fromVersionNumber,
      dto.targetBranch,
      userId,
      dto.commitMessage,
      dto.resolveConflicts
    )
    return this.versionService.toResponseDto(version)
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
    @Body() dto: CompareVersionsDto
  ): Promise<VersionComparisonDto> {
    const result = await this.versionService.compareVersions(storyId, dto.versionA, dto.versionB)

    return {
      versionA: this.versionService.toResponseDto(result.versionA),
      versionB: this.versionService.toResponseDto(result.versionB),
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
  async getBranchInfo(@Param('storyId', ParseIntPipe) storyId: number): Promise<BranchInfoDto[]> {
    return this.versionService.getBranchInfo(storyId)
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
    @Body('tag') tag: string
  ): Promise<VersionResponseDto> {
    const version = await this.versionService.tagVersion(storyId, versionNumber, tag)
    return this.versionService.toResponseDto(version)
  }
}
