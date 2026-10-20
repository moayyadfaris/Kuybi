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

    // Reveals whether an email is registered, by design (sign-up form); throttled
    return query.email
      ? this.availabilityService.isEmailAvailable(query.email)
      : this.availabilityService.isPhoneAvailable(query.phone!)
  }

  @Post('register')
  @Throttle({ default: { limit: 3, ttl: seconds(3600) } }) // 3 registrations per hour
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiOkResponse({ description: 'User registered successfully, verification email sent' })
  async register(@Body() registerDto: RegisterUserDto, @Req() req: Request) {
    const user = await this.registrationService.register(registerDto)
    await this.auditService.logCreate(
      this.auditService.createContextFromRequest(req),
      'User',
      user.id,
      {
        email: user.email
      }
    )
    this.logger.info(
      { userId: user.id, ipAddress: clientIp(req), action: 'registration_success' },
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
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    const user = await this.registrationService.verifyEmail(verifyEmailDto.token)
    return {
      message: 'Email verified successfully. You can now log in.',
      email: user.email
    }
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: seconds(300) } }) // 3 attempts per 5 minutes
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiOkResponse({
    description:
      'Same answer whether or not the email is registered or already verified (no account discovery)'
  })
  async resendVerification(@Body() resendDto: ResendVerificationDto, @Req() req: Request) {
    await this.registrationService.resendVerification(resendDto.email, clientIp(req))
    return {
      message: 'If the email is registered and not yet verified, a new verification link was sent.'
    }
  }
}
