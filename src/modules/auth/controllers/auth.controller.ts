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

/** Login, token refresh and logout (all under /api/v1/auth) */
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
    // Failed attempts are logged and counted with this context (the lockout records the IP)
    const context = {
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
      deviceType: body.deviceType
    }
    const user = await this.authService.validateUser(body.email, body.password, context)
    const result = await this.authService.login(user, context)

    await this.auditService.logLoginFromRequest(
      req,
      { id: user.id, email: user.email, name: user.name },
      { deviceType: body.deviceType, sessionType: 'standard' }
    )
    return result
  }

  @Post('refresh')
  @ApiOkResponse({ description: 'Returns a new access token using a valid refresh token' })
  async refresh(@Body() body: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refresh(body.refreshToken, {
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
      deviceType: body.deviceType
    })
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

    // The presented access token is blacklisted, so it stops working at once
    const authHeader = req.headers.authorization
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined
    const contextUser = { id: user.id, email: user.email, name: user.name }

    const result = await this.authService.logout(body.refreshToken, {
      userId: user.id,
      logoutAll: body.logoutAll,
      reason: body.reason,
      accessToken,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined
    })

    const logoutType = result.logoutType
    const message =
      logoutType === 'all_devices'
        ? `User logged out from all devices (${result.sessionsInvalidated} sessions invalidated)`
        : 'User logged out from current session'

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
