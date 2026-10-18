import {
  Controller,
  DefaultValuePipe,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { subject } from '@casl/ability'
import { Request } from 'express'

import { AbilityFactory, AbilityGuard, Action, CheckAbility, Subject } from '@modules/acl'

import { JwtAuthGuard } from '@core/auth'

import { UserProfileDto } from '../dto/user-profile.dto'
import { User } from '../entities/user.entity'
import { UsersService } from '../services/users.service'

interface AuthenticatedRequest extends Request {
  user?: User
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('v1/users')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly abilityFactory: AbilityFactory
  ) {}

  /**
   * Whether the caller may read this user's record. The route guard only checks
   * "Read User" in general, which the 'user' role has for itself ({ id: own id }).
   */
  private canRead(caller: User, userId: string): boolean {
    const target = subject(Subject.User, { id: userId }) as unknown as User
    return this.abilityFactory.createForUser(caller).can(Action.Read, target)
  }

  /** Lists and statistics cover every user, so they need read access to other users */
  private assertCanReadEveryone(req: AuthenticatedRequest): void {
    if (!req.user || !this.canRead(req.user, '\u0000someone-else')) {
      throw new ForbiddenException('You do not have permission to read other users')
    }
  }

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
    @Req() req: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: boolean,
    @Query('isVerified') isVerified?: boolean,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number
  ) {
    this.assertCanReadEveryone(req)
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
        hasMore: (offset ?? 0) + (limit ?? 20) < total
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
  async getUserStats(@Req() req: AuthenticatedRequest) {
    this.assertCanReadEveryone(req)
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
  async getUserById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    // Someone else's profile without permission: 404, so ids cannot be probed
    if (!req.user || !this.canRead(req.user, id)) {
      throw new NotFoundException('User not found')
    }
    return this.usersService.getUserProfile(id)
  }
}
