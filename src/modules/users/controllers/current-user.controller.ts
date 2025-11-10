import {
  Controller,
  Get,
  Put,
  Delete,
  UseGuards,
  Req,
  Body,
  HttpCode,
  HttpStatus
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger'
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard'
import { UsersService } from '../services/users.service'
import { UserProfileDto } from '../dto/user-profile.dto'
import { UpdateProfileImageDto } from '../dto/update-profile-image.dto'
import { User } from '../entities/user.entity'
import { Request } from 'express'

interface AuthenticatedRequest extends Request {
  user?: User
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
    const userId = req.user?.id
    if (!userId) {
      return null
    }
    return this.usersService.getUserProfile(userId)
  }

  @Put('me/profile-image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile image' })
  @ApiBody({ type: UpdateProfileImageDto })
  @ApiResponse({ status: 200, description: 'Profile image updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid attachment or not an image' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async updateProfileImage(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileImageDto) {
    const userId = req.user?.id
    if (!userId) {
      throw new Error('User ID not found in request')
    }

    const updated = await this.usersService.updateProfileImage(userId, dto.attachmentId)
    return {
      message: 'Profile image updated successfully',
      profileImageId: updated?.profileImageId
    }
  }

  @Delete('me/profile-image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove current user profile image' })
  @ApiResponse({ status: 200, description: 'Profile image removed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async removeProfileImage(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.id
    if (!userId) {
      throw new Error('User ID not found in request')
    }

    await this.usersService.removeProfileImage(userId)
    return {
      message: 'Profile image removed successfully'
    }
  }
}
