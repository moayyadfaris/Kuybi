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
  Query,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'

import { AbilityFactory, AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { GetUser, JwtAuthGuard } from '@core/auth'

import { CreateTagDto, ListTagsQueryDto, UpdateTagDto } from '../dto'
import { TagEditor, TagsService } from '../services/tags.service'
import { PresentedTag, presentTag } from '../tag.presenter'

/**
 * Tags. Reads are public; writes need the Tag permissions, and system tags are managed by
 * super-admins only.
 */
@ApiTags('Tags')
@Controller('v1/tags')
export class TagsController {
  constructor(
    private readonly tagsService: TagsService,
    private readonly abilityFactory: AbilityFactory
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Tag })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a tag' })
  @ApiResponse({ status: 201, description: 'Tag created' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Missing permission, or a system tag' })
  @ApiResponse({ status: 409, description: 'A live tag has this name' })
  async create(@Body() dto: CreateTagDto, @GetUser() user: User): Promise<PresentedTag> {
    return presentTag(await this.tagsService.create(dto, this.editor(user)))
  }

  @Get()
  @ApiOperation({ summary: 'List tags (a page, by name prefix)' })
  @ApiResponse({ status: 200, description: 'Tags' })
  async findAll(@Query() query: ListTagsQueryDto): Promise<PresentedTag[]> {
    const tags = await this.tagsService.findAll({
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      limit: query.limit,
      offset: query.offset
    })
    return tags.map(presentTag)
  }

  @Get('system')
  @ApiOperation({ summary: 'List system tags' })
  @ApiResponse({ status: 200, description: 'System tags' })
  async findSystemTags(): Promise<PresentedTag[]> {
    return (await this.tagsService.findSystemTags()).map(presentTag)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tag' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag found' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PresentedTag> {
    return presentTag(await this.tagsService.findOne(id))
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Tag })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a tag' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag updated' })
  @ApiResponse({ status: 403, description: 'Missing permission, or a system tag' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 409, description: 'A live tag has this name' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
    @GetUser() user: User
  ): Promise<PresentedTag> {
    return presentTag(await this.tagsService.update(id, dto, this.editor(user)))
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.Tag })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a tag (it leaves stories; its name becomes free)' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 204, description: 'Tag deleted' })
  @ApiResponse({ status: 403, description: 'Missing permission, or a system tag' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: User): Promise<void> {
    return this.tagsService.remove(id, this.editor(user))
  }

  @Delete(':id/hard')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Manage, subject: Subject.All })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a tag (super admin only)' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 204, description: 'Tag permanently deleted' })
  @ApiResponse({ status: 403, description: 'Super admin only' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  hardDelete(@Param('id', ParseIntPipe) id: number, @GetUser() user: User): Promise<void> {
    return this.tagsService.hardDelete(id, this.editor(user))
  }

  private editor(user: User): TagEditor {
    return {
      id: user.id,
      managesSystemTags: this.abilityFactory.createForUser(user).can(Action.Manage, Subject.All)
    }
  }
}
