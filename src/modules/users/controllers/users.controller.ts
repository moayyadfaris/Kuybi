import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { UsersService } from '../services/users.service'
import { UserProfileDto } from '../dto/user-profile.dto'

@ApiTags('Users')
@ApiBearerAuth()
@Controller('v1/users')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @CheckAbility({ action: Action.Read, subject: Subject.User })
  @ApiOperation({
    summary: 'List all users',
    description: 'Get a paginated list of users with optional filters'
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or email' })
  @ApiQuery({ name: 'role', required: false, description: 'Filter by role' })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filter by active status'
  })
  @ApiQuery({
    name: 'isVerified',
    required: false,
    type: Boolean,
    description: 'Filter by verified status'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of results per page',
    example: 20
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Offset for pagination',
    example: 0
  })
  @ApiResponse({ status: 200, description: 'Users list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async listUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: boolean,
    @Query('isVerified') isVerified?: boolean,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number
  ) {
    const [users, total] = await this.usersService.searchUsers({
      search,
      role,
      isActive,
      isVerified,
      limit,
      offset
    })

    return {
      data: users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        mobileNumber: user.mobileNumber,
        role: user.getPrimaryRoleName(),
        isActive: user.isActive,
        isVerified: user.isVerified,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    }
  }

  @Get('stats')
  @CheckAbility({ action: Action.Read, subject: Subject.User })
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Get statistics about users (total, active, verified, etc.)'
  })
  @ApiResponse({ status: 200, description: 'User statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async getUserStats() {
    return this.usersService.getUserStats()
  }

  @Get(':id')
  @CheckAbility({ action: Action.Read, subject: Subject.User })
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Get detailed information about a specific user'
  })
  @ApiResponse({ status: 200, description: 'User retrieved successfully', type: UserProfileDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserProfile(id)
  }
}
