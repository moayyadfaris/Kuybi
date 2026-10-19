import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { seconds, Throttle } from '@nestjs/throttler'
import { clientIp } from '@shared/utils/request.util'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AuditService } from '@modules/audit'
import { User } from '@modules/users/entities'

import { JwtAuthGuard } from '@core/auth'

import { LoginDto } from '../dto/login.dto'
import { LogoutDto } from '../dto/logout.dto'
import { RefreshTokenDto } from '../dto/refresh-token.dto'
import { AuthService } from '../services'

interface AuthenticatedRequest extends Request {
  user?: User
}

/** Login, token refresh, logout and the caller's sessions (all under /api/v1/auth) */
@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    @InjectPinoLogger(AuthController.name)
    private readonly logger: PinoLogger,
    private readonly authService: AuthService,
    private readonly auditService: AuditService
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  @ApiOkResponse({ description: 'Returns access & refresh tokens with user profile' })
  async login(@Body() body: LoginDto, @Req() req: Request) {
    const ipAddress = clientIp(req)
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
    const ipAddress = clientIp(req)

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
      throw new UnauthorizedException('Authenticated user not found on request context')
    }

    // Extract access token from Authorization header
    const authHeader = req.headers.authorization
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
    const contextUser = {
      id: user.id,
      email: user.email,
      name: user.email?.split('@')[0]
    }
    // Context created for potential audit logging
    this.auditService.createContextFromRequest(req, contextUser)

    this.logger.info(
      {
        userId: user.id,
        logoutAll: body.logoutAll,
        reason: body.reason,
        hasAccessToken: !!accessToken,
        action: 'logout_request'
      },
      'Logout request'
    )

    const result = await this.authService.logout(body.refreshToken, {
      userId: user.id,
      logoutAll: body.logoutAll,
      reason: body.reason,
      accessToken, // Pass access token for blacklisting
      ipAddress: clientIp(req),
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
        userId: user.id,
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
}
