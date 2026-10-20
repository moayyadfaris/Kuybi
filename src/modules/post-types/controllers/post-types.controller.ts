import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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

import { AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { GetUser, JwtAuthGuard, OptionalJwtAuthGuard } from '@core/auth'

import { CreatePostTypeDto, ResponsePostTypeDto, UpdatePostTypeDto } from '../dto'
import { ContentAccessPolicy } from '../services/content-access.policy'
import { PostTypesService } from '../services/post-types.service'

@ApiTags('Post Types')
@Controller('v1/post-types')
export class PostTypesController {
  constructor(
    private readonly postTypesService: PostTypesService,
    private readonly accessPolicy: ContentAccessPolicy
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all post types' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Include inactive post types (only for those who manage post types)'
  })
  @ApiResponse({
    status: 200,
    description: 'List of post types',
    type: [ResponsePostTypeDto]
  })
  @UseGuards(OptionalJwtAuthGuard)
  async findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
    @GetUser() viewer?: User
  ): Promise<ResponsePostTypeDto[]> {
    // Inactive types are listed only to those who manage post types
    const postTypes = await this.postTypesService.findAll(
      !!includeInactive && this.accessPolicy.managesPostTypes(viewer)
    )

    return plainToInstance(ResponsePostTypeDto, postTypes, {
      excludeExtraneousValues: true
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get post type by ID' })
  @ApiParam({ name: 'id', description: 'Post type ID' })
  @ApiResponse({
    status: 200,
    description: 'Post type found',
    type: ResponsePostTypeDto
  })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ResponsePostTypeDto> {
    const postType = await this.postTypesService.findOne(id)
    return plainToInstance(ResponsePostTypeDto, postType, {
      excludeExtraneousValues: true
    })
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get post type by slug' })
  @ApiParam({ name: 'slug', description: 'Post type slug' })
  @ApiResponse({
    status: 200,
    description: 'Post type found',
    type: ResponsePostTypeDto
  })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  async findBySlug(@Param('slug') slug: string): Promise<ResponsePostTypeDto> {
    const postType = await this.postTypesService.findBySlug(slug)
    return plainToInstance(ResponsePostTypeDto, postType, {
      excludeExtraneousValues: true
    })
  }

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.PostType })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new post type' })
  @ApiResponse({
    status: 201,
    description: 'Post type created',
    type: ResponsePostTypeDto
  })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 409, description: 'Post type already exists' })
  async create(
    @Body() createPostTypeDto: CreatePostTypeDto,
    @GetUser('id') userId: string
  ): Promise<ResponsePostTypeDto> {
    const postType = await this.postTypesService.create(createPostTypeDto, userId)
    return plainToInstance(ResponsePostTypeDto, postType, {
      excludeExtraneousValues: true
    })
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.PostType })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a post type' })
  @ApiParam({ name: 'id', description: 'Post type ID' })
  @ApiResponse({
    status: 200,
    description: 'Post type updated',
    type: ResponsePostTypeDto
  })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  @ApiResponse({ status: 409, description: 'Duplicate name/slug' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePostTypeDto: UpdatePostTypeDto,
    @GetUser('id') userId: string
  ): Promise<ResponsePostTypeDto> {
    const postType = await this.postTypesService.update(id, updatePostTypeDto, userId)
    return plainToInstance(ResponsePostTypeDto, postType, {
      excludeExtraneousValues: true
    })
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.PostType })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a post type' })
  @ApiParam({ name: 'id', description: 'Post type ID' })
  @ApiResponse({ status: 204, description: 'Post type deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete a system post type' })
  @ApiResponse({ status: 409, description: 'The post type still has entries' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.postTypesService.remove(id)
  }
}
