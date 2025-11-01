import { Controller, Get, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { UsersService } from '../services/users.service'
import { UserProfileDto } from '../dto/user-profile.dto'
import { Request } from 'express'

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    email: string
    role?: string
  }
}

@ApiTags('Users')
@Controller('v1/users')
export class CurrentUserController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile returned',
    type: UserProfileDto
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async getCurrentUser(@Req() req: AuthenticatedRequest): Promise<UserProfileDto | null> {
    const userId = req.user?.userId
    if (!userId) {
      return null
    }
    return this.usersService.getUserProfile(userId)
  }
}
