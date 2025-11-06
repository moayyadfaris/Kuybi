import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { Request } from 'express'
import { AuthService } from '../services'
import { RegistrationService } from '../services/registration.service'
import { PasswordResetService } from '../services/password-reset.service'
import { PasswordStrengthService } from '../services/password-strength.service'
import { LoginDto } from '../dto/login.dto'
import { RefreshTokenDto } from '../dto/refresh-token.dto'
import { LogoutDto } from '../dto/logout.dto'
import { ListSessionsQueryDto } from '../dto/list-sessions.query.dto'
import { CheckAvailabilityDto } from '../dto/check-availability.dto'
import { RegisterUserDto, VerifyEmailDto, ResendVerificationDto } from '../dto/register.dto'
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  ValidateResetTokenDto
} from '../dto/password-reset.dto'
import { ChangePasswordDto } from '../dto/change-password.dto'
import { CheckPasswordStrengthDto } from '../dto/check-password-strength.dto'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { UserAvailabilityService } from '@modules/users/services/user-availability.service'
import { AuditService } from '@modules/audit/services/audit.service'

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    email: string
    role: string
  }
}

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    @InjectPinoLogger(AuthController.name)
    private readonly logger: PinoLogger,
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
    private readonly passwordResetService: PasswordResetService,
    private readonly passwordStrengthService: PasswordStrengthService,
    private readonly availabilityService: UserAvailabilityService,
    private readonly auditService: AuditService
  ) {}

  @Get('check-availability')
  @Throttle({ default: { limit: 20, ttl: 60 } })
  @ApiOperation({ summary: 'Check if email or phone is available for registration' })
  @ApiOkResponse({ description: 'Returns availability status with suggestions if unavailable' })
  async checkAvailability(@Query() query: CheckAvailabilityDto) {
    if (!query.email && !query.phone) {
      throw new BadRequestException('Either email or phone must be provided')
    }

    this.logger.info(
      { email: query.email, phone: query.phone, action: 'check_availability' },
      'Checking availability'
    )

    let result

    if (query.email) {
      result = await this.availabilityService.isEmailAvailable(query.email)
    } else if (query.phone) {
      result = await this.availabilityService.isPhoneAvailable(query.phone!)
    }

    this.logger.info(
      { field: result?.field, available: result?.available, action: 'check_availability_result' },
      'Availability check completed'
    )

    return result
  }

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 3600 } }) // 3 registrations per hour
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiOkResponse({ description: 'User registered successfully, verification email sent' })
  async register(@Body() registerDto: RegisterUserDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)
    const context = this.auditService.createContextFromRequest(req)

    this.logger.info(
      { email: registerDto.email, ipAddress, action: 'registration_attempt' },
      'Registration attempt'
    )

    const user = await this.registrationService.register(registerDto)

    // Audit log: User registration
    await this.auditService.logCreate(context, 'User', user.id, { email: user.email })

    this.logger.info(
      { userId: user.id, email: user.email, ipAddress, action: 'registration_success' },
      'Registration successful'
    )

    return {
      success: true,
      data: {
        message: 'Registration successful. Please check your email to verify your account.',
        userId: user.id,
        email: user.email,
        emailVerificationRequired: true
      }
    }
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ApiOperation({ summary: 'Verify user email address' })
  @ApiOkResponse({ description: 'Email verified successfully' })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)

    this.logger.info(
      {
        token: verifyEmailDto.token.substring(0, 8) + '...',
        ipAddress,
        action: 'email_verification_attempt'
      },
      'Email verification attempt'
    )

    const user = await this.registrationService.verifyEmail(verifyEmailDto.token)

    this.logger.info(
      { userId: user.id, email: user.email, ipAddress, action: 'email_verification_success' },
      'Email verified successfully'
    )

    return {
      success: true,
      data: {
        message: 'Email verified successfully. You can now log in.',
        email: user.email
      }
    }
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 300 } }) // 3 attempts per 5 minutes
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiOkResponse({ description: 'Verification email sent' })
  async resendVerification(@Body() resendDto: ResendVerificationDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)

    this.logger.info(
      { email: resendDto.email, ipAddress, action: 'resend_verification_attempt' },
      'Resend verification attempt'
    )

    await this.registrationService.resendVerification(resendDto.email)

    this.logger.info(
      { email: resendDto.email, ipAddress, action: 'resend_verification_success' },
      'Verification email resent'
    )

    return {
      success: true,
      data: {
        message: 'Verification email sent. Please check your inbox.'
      }
    }
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 900 } }) // 3 attempts per 15 minutes
  @ApiOperation({ summary: 'Request password reset link' })
  @ApiOkResponse({ description: 'Password reset email sent if account exists' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)
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

    return {
      success: true,
      data: result
    }
  }

  @Post('validate-reset-token')
  @Throttle({ default: { limit: 10, ttl: 60 } }) // 10 attempts per minute
  @ApiOperation({ summary: 'Validate password reset token' })
  @ApiOkResponse({ description: 'Returns token validity status' })
  async validateResetToken(@Body() validateTokenDto: ValidateResetTokenDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)

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

    return {
      success: true,
      data: result
    }
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 300 } }) // 5 attempts per 5 minutes
  @ApiOperation({ summary: 'Reset password with valid token' })
  @ApiOkResponse({ description: 'Password reset successfully' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)

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

    return {
      success: true,
      data: result
    }
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @ApiOkResponse({ description: 'Returns access & refresh tokens with user profile' })
  async login(@Body() body: LoginDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)
    const userAgent = req.headers['user-agent'] as string | undefined

    this.logger.info(
      {
        email: body.email,
        ipAddress,
        userAgent,
        deviceType: body.deviceType,
        action: 'login_attempt'
      },
      'Login attempt'
    )

    const user = await this.authService.validateUser(body.email, body.password)

    const result = await this.authService.login(user, {
      ipAddress,
      userAgent,
      deviceType: body.deviceType
    })

    // Audit log: Successful login
    await this.auditService.logLoginFromRequest(
      req,
      {
        id: user.id,
        email: user.email,
        name: user.name
      },
      {
        deviceType: body.deviceType,
        sessionType: 'standard'
      }
    )

    this.logger.info(
      { userId: user.id, email: user.email, ipAddress, action: 'login_success' },
      'Login successful'
    )

    return result
  }

  @Post('refresh')
  @ApiOkResponse({ description: 'Returns a new access token using a valid refresh token' })
  async refresh(@Body() body: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)

    this.logger.info({ ipAddress, action: 'token_refresh_attempt' }, 'Token refresh attempt')

    const result = await this.authService.refresh(body.refreshToken, {
      ipAddress,
      userAgent: req.headers['user-agent'] as string | undefined,
      deviceType: body.deviceType
    })

    this.logger.info({ ipAddress, action: 'token_refresh_success' }, 'Token refresh successful')

    return result
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Invalidates refresh token and terminates session(s)' })
  async logout(@Body() body: LogoutDto, @Req() req: AuthenticatedRequest) {
    const user = req.user
    if (!user) {
      throw new Error('Authenticated user not found on request context')
    }

    // Extract access token from Authorization header
    const authHeader = req.headers.authorization
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
    const contextUser = {
      id: user.userId,
      email: user.email,
      name: user.email?.split('@')[0]
    }
    // Context created for potential audit logging
    this.auditService.createContextFromRequest(req, contextUser)

    this.logger.info(
      {
        userId: user.userId,
        logoutAll: body.logoutAll,
        reason: body.reason,
        hasAccessToken: !!accessToken,
        action: 'logout_request'
      },
      'Logout request'
    )

    const result = await this.authService.logout(body.refreshToken, {
      userId: user.userId,
      logoutAll: body.logoutAll,
      reason: body.reason,
      accessToken, // Pass access token for blacklisting
      ipAddress: this.extractIp(req),
      userAgent: req.headers['user-agent'] as string | undefined
    })

    const logoutType = result.logoutType
    const message =
      logoutType === 'all_devices'
        ? `User logged out from all devices (${result.sessionsInvalidated} sessions invalidated)`
        : 'User logged out from current session'

    // Audit log: Logout
    if (body.logoutAll) {
      await this.auditService.logLogoutAllFromRequest(req, result.sessionsInvalidated, contextUser)
    } else {
      await this.auditService.logLogoutFromRequest(req, contextUser)
    }

    this.logger.info(
      {
        userId: user.userId,
        logoutType,
        sessionsInvalidated: result.sessionsInvalidated,
        action: 'logout_success'
      },
      message
    )

    return {
      message,
      sessionsInvalidated: result.sessionsInvalidated,
      metadata: {
        logoutType,
        reason: body.reason || 'user_initiated'
      }
    }
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Lists active sessions for current user' })
  async listSessions(@Query() query: ListSessionsQueryDto, @Req() req: AuthenticatedRequest) {
    const user = req.user
    if (!user) {
      throw new Error('Authenticated user not found on request context')
    }

    this.logger.info(
      {
        userId: user.userId,
        page: query.page,
        limit: query.limit,
        action: 'list_sessions_request'
      },
      'List sessions request'
    )

    const result = await this.authService.listSessions(user.userId, query)

    this.logger.info(
      {
        userId: user.userId,
        total: result.total,
        page: result.page,
        action: 'list_sessions_success'
      },
      'Sessions listed successfully'
    )

    return {
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit) || 1
      },
      sessions: result.sessions
    }
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 300 } }) // 5 attempts per 5 minutes
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
        success: { type: 'boolean', example: true },
        sessionsRevoked: { type: 'number', example: 3 },
        notificationSent: { type: 'boolean', example: true }
      }
    }
  })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: AuthenticatedRequest) {
    const user = req.user
    if (!user) {
      throw new Error('Authenticated user not found on request context')
    }

    const context = this.auditService.createContextFromRequest(req, {
      id: user.userId,
      email: user.email,
      name: user.email?.split('@')[0]
    })

    this.logger.info(
      {
        userId: user.userId,
        email: user.email,
        action: 'change_password_attempt',
        invalidateAllSessions: dto.invalidateAllSessions,
        sendNotification: dto.sendNotificationEmail
      },
      'Password change attempt'
    )

    // Extract current session ID from JWT token to keep it active if requested
    const currentSessionId = (req as AuthenticatedRequest & { sessionId?: string }).sessionId

    const result = await this.authService.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
      dto.confirmPassword,
      {
        invalidateAllSessions: dto.invalidateAllSessions,
        sendNotificationEmail: dto.sendNotificationEmail,
        currentSessionId: dto.invalidateAllSessions === false ? undefined : currentSessionId
      },
      {
        ipAddress: this.extractIp(req),
        userAgent: req.headers['user-agent'] as string | undefined
      }
    )

    // Audit log: Password change
    await this.auditService.logPasswordChange(context)

    this.logger.info(
      {
        userId: user.userId,
        action: 'change_password_success',
        sessionsRevoked: result.sessionsRevoked,
        notificationSent: result.notificationSent
      },
      'Password changed successfully'
    )

    return result
  }

  @Post('password-strength')
  @Throttle({ default: { limit: 30, ttl: 60 } }) // 30 requests per minute
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

  private extractIp(request: Request): string | undefined {
    const forwarded = request.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim()
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0]
    }
    return request.ip
  }
}
