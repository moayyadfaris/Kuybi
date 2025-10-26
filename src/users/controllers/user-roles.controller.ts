import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { UserRolesService } from '../services/user-roles.service'
import { AssignRoleDto } from '../../acl/dto/assign-role.dto'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { AbilityGuard } from '../../acl/abilities/ability.guard'
import { CheckAbility } from '../../acl/abilities/ability.decorator'
import { Action } from '../../acl/types/actions.enum'
import { Subject } from '../../acl/types/subjects.enum'

@ApiTags('User Roles')
@ApiBearerAuth()
@Controller('v1/users/:userId/roles')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class UserRolesController {
  constructor(private readonly userRolesService: UserRolesService) {}

  @Get()
  @CheckAbility({ action: Action.Read, subject: Subject.User })
  @ApiOperation({ summary: 'Get all roles assigned to a user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User roles retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserRoles(@Param('userId') userId: string) {
    return this.userRolesService.getUserRoles(userId)
  }

  @Post()
  @CheckAbility({ action: Action.Assign, subject: Subject.Role })
  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 201, description: 'Role assigned successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - invalid role or user' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires assign:Role permission' })
  @ApiResponse({ status: 404, description: 'User or role not found' })
  @ApiResponse({ status: 409, description: 'Role already assigned to user' })
  async assignRole(
    @Param('userId') userId: string,
    @Body() assignRoleDto: AssignRoleDto,
  ) {
    return this.userRolesService.assignRole(userId, assignRoleDto)
  }

  @Delete(':roleId')
  @CheckAbility({ action: Action.Assign, subject: Subject.Role })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a role from a user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiResponse({ status: 204, description: 'Role revoked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires assign:Role permission' })
  @ApiResponse({ status: 404, description: 'User role assignment not found' })
  async revokeRole(
    @Param('userId') userId: string,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    await this.userRolesService.revokeRole(userId, roleId)
  }

  @Post(':roleId/activate')
  @CheckAbility({ action: Action.Assign, subject: Subject.Role })
  @ApiOperation({ summary: 'Activate a user role assignment' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role activated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires assign:Role permission' })
  @ApiResponse({ status: 404, description: 'User role assignment not found' })
  async activateRole(
    @Param('userId') userId: string,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.userRolesService.activateRole(userId, roleId)
  }

  @Post(':roleId/deactivate')
  @CheckAbility({ action: Action.Assign, subject: Subject.Role })
  @ApiOperation({ summary: 'Deactivate a user role assignment' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiParam({ name: 'roleId', description: 'Role ID' })
  @ApiResponse({ status: 200, description: 'Role deactivated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires assign:Role permission' })
  @ApiResponse({ status: 404, description: 'User role assignment not found' })
  async deactivateRole(
    @Param('userId') userId: string,
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.userRolesService.deactivateRole(userId, roleId)
  }
}
