import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { seconds, Throttle } from '@nestjs/throttler'
import { clientIp, parseUserAgent } from '@shared/utils/request.util'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AuditService } from '@modules/audit'
import { User } from '@modules/users/entities'

import { AllowPasswordChangeToken, JwtAuthGuard } from '@core/auth'

import { ChangePasswordDto } from '../dto/change-password.dto'
import { CheckPasswordStrengthDto } from '../dto/check-password-strength.dto'
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  ValidateResetTokenDto
} from '../dto/password-reset.dto'
import { PasswordHistoryRepository } from '../repositories/password-history.repository'
import { PasswordChangeService } from '../services'
import { PasswordResetService } from '../services/password-reset.service'
import { PasswordStrengthService } from '../services/password-strength.service'

interface AuthenticatedRequest extends Request {
  user?: User
}

/** Passwords: reset by email, change, strength check and change history (all under /api/v1/auth) */
@ApiTags('auth')
@Controller('v1/auth')
export class PasswordController {
  constructor(
    @InjectPinoLogger(PasswordController.name)
    private readonly logger: PinoLogger,
    private readonly passwordChangeService: PasswordChangeService,
    private readonly passwordResetService: PasswordResetService,
    private readonly passwordStrengthService: PasswordStrengthService,
    private readonly passwordHistoryRepository: PasswordHistoryRepository,
    private readonly auditService: AuditService
  ) {}

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: seconds(900) } }) // 3 attempts per 15 minutes
  @ApiOperation({ summary: 'Request password reset link' })
  @ApiOkResponse({ description: 'Password reset email sent if account exists' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto, @Req() req: Request) {
    const ipAddress = clientIp(req)
    const userAgent = req.headers['user-agent'] as string | undefined

    this.logger.info(
      { email: forgotPasswordDto.email, ipAddress, action: 'forgot_password_attempt' },
      'Password reset requested'
    )

    const result = await this.passwordResetService.requestPasswordReset(
      forgotPasswordDto,
      ipAddress,
      userAgent
    )

    this.logger.info(
      { email: forgotPasswordDto.email, ipAddress, action: 'forgot_password_processed' },
      'Password reset request processed'
    )

    return result
  }

  @Post('validate-reset-token')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } }) // 10 attempts per minute
  @ApiOperation({ summary: 'Validate password reset token' })
  @ApiOkResponse({ description: 'Returns token validity status' })
  async validateResetToken(@Body() validateTokenDto: ValidateResetTokenDto, @Req() req: Request) {
    const ipAddress = clientIp(req)

    this.logger.info(
      {
        token: validateTokenDto.token.substring(0, 8) + '...',
        ipAddress,
        action: 'validate_reset_token_attempt'
      },
      'Reset token validation attempt'
    )

    const result = await this.passwordResetService.validateResetToken(validateTokenDto)

    this.logger.info(
      { valid: result.valid, ipAddress, action: 'validate_reset_token_result' },
      'Reset token validation completed'
    )

    return result
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: seconds(300) } }) // 5 attempts per 5 minutes
  @ApiOperation({ summary: 'Reset password with valid token' })
  @ApiOkResponse({ description: 'Password reset successfully' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto, @Req() req: Request) {
    const ipAddress = clientIp(req)

    this.logger.info(
      {
        token: resetPasswordDto.token.substring(0, 8) + '...',
        ipAddress,
        action: 'reset_password_attempt'
      },
      'Password reset attempt'
    )

    const result = await this.passwordResetService.resetPassword(resetPasswordDto, ipAddress)

    // Audit log: Password reset
    await this.auditService.logPasswordResetFromRequest(req, false)

    this.logger.info(
      { email: result.email, ipAddress, action: 'reset_password_success' },
      'Password reset successfully'
    )

    return result
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangeToken()
  @Throttle({ default: { limit: 5, ttl: seconds(300) } }) // 5 attempts per 5 minutes
  @ApiOperation({
    summary: 'Change password',
    description:
      'Allows users to change their password. ' +
      'Validates current password, sets new password, and clears the forcePasswordChange flag. ' +
      'Optionally invalidates all other sessions (default: true) or keeps them active. ' +
      'Optionally sends email notification (default: true).'
  })
  @ApiOkResponse({
    description: 'Password changed successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Password changed successfully. Other sessions have been logged out.'
        },
        sessionsRevoked: { type: 'number', example: 3 },
        notificationSent: { type: 'boolean', example: true }
      }
    }
  })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: AuthenticatedRequest) {
    const user = req.user
    if (!user) {
      throw new UnauthorizedException('Authenticated user not found on request context')
    }

    const context = this.auditService.createContextFromRequest(req, {
      id: user.id,
      email: user.email,
      name: user.email?.split('@')[0]
    })

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        action: 'change_password_attempt',
        invalidateAllSessions: dto.invalidateAllSessions,
        sendNotification: dto.sendNotificationEmail
      },
      'Password change attempt'
    )

    // Session of the access token used for this request (set by JwtStrategy); kept active
    const currentSessionId = req.sessionId

    const result = await this.passwordChangeService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      dto.confirmPassword,
      {
        invalidateAllSessions: dto.invalidateAllSessions,
        sendNotificationEmail: dto.sendNotificationEmail,
        currentSessionId: dto.invalidateAllSessions === false ? undefined : currentSessionId
      },
      {
        ipAddress: clientIp(req),
        userAgent: req.headers['user-agent'] as string | undefined
      }
    )

    // Audit log: Password change
    await this.auditService.logPasswordChange(context)

    this.logger.info(
      {
        userId: user.id,
        action: 'change_password_success',
        sessionsRevoked: result.sessionsRevoked,
        notificationSent: result.notificationSent
      },
      'Password changed successfully'
    )

    return result
  }

  @Post('password-strength')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } }) // 30 requests per minute
  @ApiOperation({
    summary: 'Check password strength',
    description:
      'Validates password strength and provides feedback. Returns a score (0-4) and suggestions for improvement. Useful for real-time password strength indicators during registration or password change.'
  })
  @ApiOkResponse({
    description: 'Password strength analysis',
    schema: {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          description: 'Strength score from 0 (very weak) to 4 (very strong)',
          example: 3
        },
        strength: {
          type: 'string',
          enum: ['very-weak', 'weak', 'fair', 'strong', 'very-strong'],
          example: 'strong'
        },
        passed: {
          type: 'boolean',
          description: 'Whether password meets minimum requirements (score >= 2)',
          example: true
        },
        feedback: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suggestions to improve password strength',
          example: ['Add special characters (!@#$%^&*)']
        },
        isBreached: {
          type: 'boolean',
          description: 'Whether password has been exposed in data breaches (future feature)',
          example: false
        },
        requirements: {
          type: 'object',
          properties: {
            minLength: { type: 'boolean', example: true },
            hasUppercase: { type: 'boolean', example: true },
            hasLowercase: { type: 'boolean', example: true },
            hasNumber: { type: 'boolean', example: true },
            hasSpecialChar: { type: 'boolean', example: false }
          }
        }
      }
    }
  })
  async checkPasswordStrength(@Body() dto: CheckPasswordStrengthDto) {
    this.logger.debug({ action: 'check_password_strength' }, 'Checking password strength')

    const result = await this.passwordStrengthService.calculateStrength(dto.password)

    this.logger.debug(
      {
        action: 'password_strength_checked',
        score: result.score,
        strength: result.strength,
        passed: result.passed
      },
      'Password strength checked'
    )

    return result
  }

  @Get('password-history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({
    summary: 'Get password change history',
    description:
      'Retrieve the history of password changes for the authenticated user. ' +
      'Shows when, where, and from which device passwords were changed. ' +
      'Useful for security auditing and detecting unauthorized changes.'
  })
  @ApiOkResponse({
    description: 'Password change history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 5 },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
              changedAt: {
                type: 'string',
                format: 'date-time',
                example: '2025-11-06T15:40:38.609Z'
              },
              ipAddress: { type: 'string', example: '192.168.1.1' },
              userAgent: { type: 'string', example: 'Mozilla/5.0...' },
              device: {
                type: 'object',
                properties: {
                  type: { type: 'string', example: 'desktop' },
                  browser: { type: 'string', example: 'Chrome' },
                  os: { type: 'string', example: 'macOS' }
                }
              }
            }
          }
        }
      }
    }
  })
  async getPasswordHistory(@Req() req: AuthenticatedRequest) {
    const user = req.user
    if (!user) {
      throw new UnauthorizedException('Authenticated user not found on request context')
    }

    this.logger.info(
      { userId: user.id, action: 'get_password_history' },
      'Fetching password change history'
    )

    const history = await this.passwordHistoryRepository.findByUser(user.id, 20)

    const changes = history.map(entry => ({
      id: entry.id,
      changedAt: entry.createdAt,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      device: parseUserAgent(entry.userAgent)
    }))

    this.logger.info(
      {
        userId: user.id,
        action: 'password_history_retrieved',
        count: changes.length
      },
      'Password history retrieved successfully'
    )

    return {
      total: changes.length,
      changes
    }
  }
}
