import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'

import { JwtAuthGuard } from '@core/auth'

import { AssignPermissionsDto, RemovePermissionsDto } from '../dto/assign-permissions.dto'
import { CreateRoleDto } from '../dto/create-role.dto'
import { UpdateRoleDto } from '../dto/update-role.dto'
import { SuperAdminGuard } from '../guards/super-admin.guard'
import { RolesService } from '../services/roles.service'
import { AclPrincipal } from '../types/acl-principal'

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('v1/roles')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - role name already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async create(@Body() createRoleDto: CreateRoleDto, @Req() req: Request) {
    return this.rolesService.create(createRoleDto, actorOf(req))
  }

  @Get()
  @ApiOperation({ summary: 'Get all roles' })
  @ApiQuery({
    name: 'includePermissions',
    required: false,
    type: Boolean,
    description: 'Include permissions for each role'
  })
  @ApiResponse({ status: 200, description: 'Roles retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async findAll(
    @Query('includePermissions', new ParseBoolPipe({ optional: true })) includePermissions?: boolean
  ) {
    if (includePermissions) {
      return this.rolesService.findAllWithPermissions()
    }
    return this.rolesService.findAll()
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all active roles' })
  @ApiResponse({ status: 200, description: 'Active roles retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async findActive() {
    return this.rolesService.findActive()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiResponse({ status: 200, description: 'Role retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id)
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: 'Get all permissions for a role' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async getRolePermissions(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.getRolePermissions(id)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a role' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid data or system role restriction'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
    @Req() req: Request
  ) {
    return this.rolesService.update(id, updateRoleDto, actorOf(req))
  }

  @Post(':id/permissions')
  @ApiOperation({ summary: 'Assign permissions to a role' })
  @ApiResponse({ status: 200, description: 'Permissions assigned successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid permission IDs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async assignPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() assignPermissionsDto: AssignPermissionsDto,
    @Req() req: Request
  ) {
    return this.rolesService.assignPermissions(id, assignPermissionsDto, actorOf(req))
  }

  @Delete(':id/permissions')
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
    @Body() removePermissionsDto: RemovePermissionsDto,
    @Req() req: Request
  ) {
    return this.rolesService.removePermissions(id, removePermissionsDto, actorOf(req))
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a role' })
  @ApiResponse({ status: 204, description: 'Role deleted successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - cannot delete system roles' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    await this.rolesService.remove(id, actorOf(req))
  }
}

/** JwtAuthGuard and SuperAdminGuard guard the controller, so the user is set */
const actorOf = (req: Request) => (req as unknown as { user: AclPrincipal }).user
