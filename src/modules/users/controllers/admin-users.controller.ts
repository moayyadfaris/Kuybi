import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { AbilityGuard } from '../../acl/abilities/ability.guard'
import { CheckAbility } from '../../acl/abilities/ability.decorator'
import { Action } from '../../acl/types/actions.enum'
import { Subject } from '../../acl/types/subjects.enum'
import { AdminPasswordManagementService } from '../services/admin-password-management.service'
import {
  AdminResetPasswordDto,
  AdminSetPasswordDto,
  AdminPasswordResetResponseDto,
} from '../dto/admin-password-management.dto'

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AdminUsersController {
  constructor(
    private readonly adminPasswordService: AdminPasswordManagementService,
  ) {}

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @CheckAbility({ action: Action.Update, subject: Subject.User })
  @ApiOperation({
    summary: 'Reset user password (system-generated)',
    description:
      'Admin resets user password. System generates a secure random password and returns it. ' +
      'User will be required to change password on next login. All active sessions are invalidated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully. Returns temporary password.',
    type: AdminPasswordResetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot reset password for inactive user',
  })
  async resetPassword(
    @Body() dto: AdminResetPasswordDto,
    @Request() req,
  ): Promise<AdminPasswordResetResponseDto> {
    return this.adminPasswordService.resetPassword(
      dto,
      req.user.id,
      req.user.email,
    )
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @CheckAbility({ action: Action.Update, subject: Subject.User })
  @ApiOperation({
    summary: 'Set user password (admin-defined)',
    description:
      'Admin sets a specific password for user (emergency access). ' +
      'Password must meet strength requirements. User can be required to change password on next login. ' +
      'All active sessions are invalidated. Optional email notification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password set successfully.',
    type: AdminPasswordResetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({
    status: 400,
    description:
      'Cannot set password for inactive user or password too weak',
  })
  async setPassword(
    @Body() dto: AdminSetPasswordDto,
    @Request() req,
  ): Promise<AdminPasswordResetResponseDto> {
    return this.adminPasswordService.setPassword(
      dto,
      req.user.id,
      req.user.email,
    )
  }
}
