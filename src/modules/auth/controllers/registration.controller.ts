import { BadRequestException, Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { seconds, Throttle } from '@nestjs/throttler'
import { clientIp } from '@shared/utils/request.util'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AuditService } from '@modules/audit'
import { UserAvailabilityService } from '@modules/users'

import { CheckAvailabilityDto } from '../dto/check-availability.dto'
import { RegisterUserDto, ResendVerificationDto, VerifyEmailDto } from '../dto/register.dto'
import { RegistrationService } from '../services/registration.service'

/** Sign-up: availability check, registration and email verification (all under /api/v1/auth) */
@ApiTags('auth')
@Controller('v1/auth')
export class RegistrationController {
  constructor(
    @InjectPinoLogger(RegistrationController.name)
    private readonly logger: PinoLogger,
    private readonly registrationService: RegistrationService,
    private readonly availabilityService: UserAvailabilityService,
    private readonly auditService: AuditService
  ) {}

  @Get('check-availability')
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
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
  @Throttle({ default: { limit: 3, ttl: seconds(3600) } }) // 3 registrations per hour
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiOkResponse({ description: 'User registered successfully, verification email sent' })
  async register(@Body() registerDto: RegisterUserDto, @Req() req: Request) {
    const ipAddress = clientIp(req)
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
      message: 'Registration successful. Please check your email to verify your account.',
      userId: user.id,
      email: user.email,
      emailVerificationRequired: true
    }
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Verify user email address' })
  @ApiOkResponse({ description: 'Email verified successfully' })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto, @Req() req: Request) {
    const ipAddress = clientIp(req)

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
      message: 'Email verified successfully. You can now log in.',
      email: user.email
    }
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: seconds(300) } }) // 3 attempts per 5 minutes
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiOkResponse({ description: 'Verification email sent' })
  async resendVerification(@Body() resendDto: ResendVerificationDto, @Req() req: Request) {
    const ipAddress = clientIp(req)

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
      message: 'Verification email sent. Please check your inbox.'
    }
  }
}
