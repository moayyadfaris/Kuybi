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
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { PostTypesService } from '../services/post-types.service'
import { CreatePostTypeDto, UpdatePostTypeDto, ResponsePostTypeDto } from '../dto'
import { plainToInstance } from 'class-transformer'

@ApiTags('Post Types')
@Controller('v1/post-types')
export class PostTypesController {
  constructor(private readonly postTypesService: PostTypesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all post types' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Include inactive post types',
  })
  @ApiResponse({
    status: 200,
    description: 'List of post types',
    type: [ResponsePostTypeDto],
  })
  async findAll(@Query('includeInactive') includeInactive?: string): Promise<ResponsePostTypeDto[]> {
    const includeInactiveBool = includeInactive === 'true'
    const postTypes = await this.postTypesService.findAll(includeInactiveBool)

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
    type: ResponsePostTypeDto,
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
    type: ResponsePostTypeDto,
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
    type: ResponsePostTypeDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 409, description: 'Post type already exists' })
  async create(@Body() createPostTypeDto: CreatePostTypeDto): Promise<ResponsePostTypeDto> {
    const postType = await this.postTypesService.create(createPostTypeDto)
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
    type: ResponsePostTypeDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Post type not found' })
  @ApiResponse({ status: 409, description: 'Duplicate name/slug' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePostTypeDto: UpdatePostTypeDto
  ): Promise<ResponsePostTypeDto> {
    const postType = await this.postTypesService.update(id, updatePostTypeDto)
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
  @ApiResponse({
    status: 422,
    description: 'Cannot delete system post type',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.postTypesService.remove(id)
  }
}
