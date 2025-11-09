import { Controller, Post, Patch, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { SuperAdminGuard } from '../../acl/guards/super-admin.guard'
import { AdminPasswordManagementService } from '../services/admin-password-management.service'
import { AdminUserManagementService } from '../services/admin-user-management.service'
import {
  AdminResetPasswordDto,
  AdminSetPasswordDto,
  AdminPasswordResetResponseDto
} from '../dto/admin-password-management.dto'
import {
  AdminUpdateUserDto,
  AdminUpdateUserResponseDto
} from '../dto/admin-update-user.dto'

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminUsersController {
  constructor(
    private readonly adminPasswordService: AdminPasswordManagementService,
    private readonly adminUserService: AdminUserManagementService
  ) {}

  @Patch(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update user (super-admin only)',
    description:
      'Super-admin updates any user field including personal information, account status, ' +
      'role assignment, and security settings. All changes are logged to audit trail with HIGH severity. ' +
      'Email and mobile number uniqueness is validated.'
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: AdminUpdateUserResponseDto
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 400, description: 'Invalid data or role not found' })
  @ApiResponse({ status: 409, description: 'Email or mobile number already in use' })
  async updateUser(
    @Param('userId') userId: string,
    @Body() dto: AdminUpdateUserDto,
    @Request() req
  ): Promise<AdminUpdateUserResponseDto> {
    return this.adminUserService.updateUser(userId, dto, req.user.id, req.user.email)
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset user password (super-admin only)',
    description:
      'Super-admin resets user password. System generates a secure random password and returns it. ' +
      'User will be required to change password on next login. All active sessions are invalidated.'
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully. Returns temporary password.',
    type: AdminPasswordResetResponseDto
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot reset password for inactive user'
  })
  async resetPassword(
    @Body() dto: AdminResetPasswordDto,
    @Request() req
  ): Promise<AdminPasswordResetResponseDto> {
    return this.adminPasswordService.resetPassword(dto, req.user.id, req.user.email)
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set user password (super-admin only)',
    description:
      'Super-admin sets a specific password for user (emergency access). ' +
      'Password must meet strength requirements. User can be required to change password on next login. ' +
      'All active sessions are invalidated. Optional email notification.'
  })
  @ApiResponse({
    status: 200,
    description: 'Password set successfully.',
    type: AdminPasswordResetResponseDto
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot set password for inactive user or password too weak'
  })
  async setPassword(
    @Body() dto: AdminSetPasswordDto,
    @Request() req
  ): Promise<AdminPasswordResetResponseDto> {
    return this.adminPasswordService.setPassword(dto, req.user.id, req.user.email)
  }
}
