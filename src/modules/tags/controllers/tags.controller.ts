import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Query
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery
} from '@nestjs/swagger'
import { Request } from 'express'
import { TagsService } from '@modules/tags/services/tags.service'
import { CreateTagDto, UpdateTagDto } from '@modules/tags/dto'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'

interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

@ApiTags('Tags')
@Controller('v1/tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Create, subject: Subject.Tag })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, description: 'Tag created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 409, description: 'Tag already exists' })
  create(@Body() createTagDto: CreateTagDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.tagsService.create(createTagDto, userId)
  }

  @Get()
  @ApiOperation({ summary: 'Get all tags' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['name', 'sortOrder', 'createdAt'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiResponse({ status: 200, description: 'List of tags' })
  findAll(
    @Query('sortBy') sortBy?: 'name' | 'sortOrder' | 'createdAt',
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC'
  ) {
    return this.tagsService.findAll({ sortBy, sortOrder })
  }

  @Get('system')
  @ApiOperation({ summary: 'Get system tags' })
  @ApiResponse({ status: 200, description: 'List of system tags' })
  findSystemTags() {
    return this.tagsService.findSystemTags()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tag by ID' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag found' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tagsService.findOne(id)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Update, subject: Subject.Tag })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a tag' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag updated successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 400, description: 'Cannot modify system tags' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTagDto: UpdateTagDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = req.user?.id
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.tagsService.update(id, updateTagDto, userId)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Delete, subject: Subject.Tag })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a tag' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 204, description: 'Tag deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete system tags' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.tagsService.remove(id, userId)
  }

  @Delete(':id/hard')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility({ action: Action.Manage, subject: Subject.All })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a tag (super admin only)' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 204, description: 'Tag permanently deleted' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete system tags' })
  @ApiResponse({ status: 403, description: 'Forbidden - super admin only' })
  hardDelete(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id
    if (!userId) {
      throw new Error('User not authenticated')
    }
    return this.tagsService.hardDelete(id, userId)
  }
}
