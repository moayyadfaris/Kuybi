import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { RolesService } from '../services/roles.service'
import { CreateRoleDto } from '../dto/create-role.dto'
import { UpdateRoleDto } from '../dto/update-role.dto'
import { AssignPermissionsDto, RemovePermissionsDto } from '../dto/assign-permissions.dto'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { SuperAdminGuard } from '../guards/super-admin.guard'
import { CheckAbility } from '../abilities/ability.decorator'
import { AbilityGuard } from '../abilities/ability.guard'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('v1/roles')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @CheckAbility({ action: Action.Create, subject: Subject.Role })
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - role name already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto)
  }

  @Get()
  @CheckAbility({ action: Action.Read, subject: Subject.Role })
  @ApiOperation({ summary: 'Get all roles' })
  @ApiResponse({ status: 200, description: 'Roles retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async findAll() {
    return this.rolesService.findAll()
  }

  @Get('active')
  @CheckAbility({ action: Action.Read, subject: Subject.Role })
  @ApiOperation({ summary: 'Get all active roles' })
  @ApiResponse({ status: 200, description: 'Active roles retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async findActive() {
    return this.rolesService.findActive()
  }

  @Get(':id')
  @CheckAbility({ action: Action.Read, subject: Subject.Role })
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiResponse({ status: 200, description: 'Role retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id)
  }

  @Get(':id/permissions')
  @CheckAbility({ action: Action.Read, subject: Subject.Role })
  @ApiOperation({ summary: 'Get all permissions for a role' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async getRolePermissions(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.getRolePermissions(id)
  }

  @Put(':id')
  @CheckAbility({ action: Action.Update, subject: Subject.Role })
  @ApiOperation({ summary: 'Update a role' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid data or system role restriction'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto)
  }

  @Post(':id/permissions')
  @CheckAbility({ action: Action.Update, subject: Subject.Role })
  @ApiOperation({ summary: 'Assign permissions to a role' })
  @ApiResponse({ status: 200, description: 'Permissions assigned successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid permission IDs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async assignPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() assignPermissionsDto: AssignPermissionsDto
  ) {
    return this.rolesService.assignPermissions(id, assignPermissionsDto)
  }

  @Delete(':id/permissions')
  @CheckAbility({ action: Action.Update, subject: Subject.Role })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove permissions from a role' })
  @ApiResponse({ status: 200, description: 'Permissions removed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - cannot remove all permissions from system role'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async removePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() removePermissionsDto: RemovePermissionsDto
  ) {
    return this.rolesService.removePermissions(id, removePermissionsDto)
  }

  @Delete(':id')
  @CheckAbility({ action: Action.Delete, subject: Subject.Role })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a role' })
  @ApiResponse({ status: 204, description: 'Role deleted successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - cannot delete system roles' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.rolesService.remove(id)
  }
}
