import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { PermissionsService } from '../services/permissions.service'
import { CreatePermissionDto } from '../dto/create-permission.dto'
import { UpdatePermissionDto } from '../dto/update-permission.dto'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { SuperAdminGuard } from '../guards/super-admin.guard'
import { CheckAbility } from '../abilities/ability.decorator'
import { AbilityGuard } from '../abilities/ability.guard'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('v1/permissions')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @CheckAbility({ action: Action.Create, subject: Subject.Permission })
  @ApiOperation({ summary: 'Create a new permission' })
  @ApiResponse({ status: 201, description: 'Permission created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - permission already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionsService.create(createPermissionDto)
  }

  @Get()
  @CheckAbility({ action: Action.Read, subject: Subject.Permission })
  @ApiOperation({ summary: 'Get all permissions or filter by action/subject' })
  @ApiQuery({ name: 'action', required: false, enum: Action, description: 'Filter by action' })
  @ApiQuery({ name: 'subject', required: false, enum: Subject, description: 'Filter by subject' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async findAll(@Query('action') action?: Action, @Query('subject') subject?: Subject) {
    if (action && subject) {
      const permission = await this.permissionsService.findByActionAndSubject(action, subject)
      return permission ? [permission] : []
    }

    if (action) {
      return this.permissionsService.findByAction(action)
    }

    if (subject) {
      return this.permissionsService.findBySubject(subject)
    }

    return this.permissionsService.findAll()
  }

  @Get(':id')
  @CheckAbility({ action: Action.Read, subject: Subject.Permission })
  @ApiOperation({ summary: 'Get permission by ID' })
  @ApiResponse({ status: 200, description: 'Permission retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Permission not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.permissionsService.findOne(id)
  }

  @Put(':id')
  @CheckAbility({ action: Action.Update, subject: Subject.Permission })
  @ApiOperation({ summary: 'Update a permission' })
  @ApiResponse({ status: 200, description: 'Permission updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - duplicate permission' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Permission not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePermissionDto: UpdatePermissionDto
  ) {
    return this.permissionsService.update(id, updatePermissionDto)
  }

  @Delete(':id')
  @CheckAbility({ action: Action.Delete, subject: Subject.Permission })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a permission' })
  @ApiResponse({ status: 204, description: 'Permission deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Permission not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.permissionsService.remove(id)
  }
}
