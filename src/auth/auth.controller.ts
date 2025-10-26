import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { Request } from 'express'
import { AuthService } from './services'
import { LoginDto } from './dto/login.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { LogoutDto } from './dto/logout.dto'
import { ListSessionsQueryDto } from './dto/list-sessions.query.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

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
    private readonly authService: AuthService
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @ApiOkResponse({ description: 'Returns access & refresh tokens with user profile' })
  async login(@Body() body: LoginDto, @Req() req: Request) {
    const ipAddress = this.extractIp(req)
    const userAgent = req.headers['user-agent'] as string | undefined
    
    this.logger.info(
      { email: body.email, ipAddress, userAgent, deviceType: body.deviceType, action: 'login_attempt' },
      'Login attempt'
    )
    
    const user = await this.authService.validateUser(body.email, body.password)
    const result = await this.authService.login(user, {
      ipAddress,
      userAgent,
      deviceType: body.deviceType
    })
    
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
    
    this.logger.info(
      { ipAddress, action: 'token_refresh_attempt' },
      'Token refresh attempt'
    )
    
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
    
    this.logger.info(
      { userId: user.userId, logoutAll: body.logoutAll, reason: body.reason, hasAccessToken: !!accessToken, action: 'logout_request' },
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
    const message = logoutType === 'all_devices'
      ? `User logged out from all devices (${result.sessionsInvalidated} sessions invalidated)`
      : 'User logged out from current session'

    this.logger.info(
      { userId: user.userId, logoutType, sessionsInvalidated: result.sessionsInvalidated, action: 'logout_success' },
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
      { userId: user.userId, page: query.page, limit: query.limit, action: 'list_sessions_request' },
      'List sessions request'
    )

    const result = await this.authService.listSessions(user.userId, query)
    
    this.logger.info(
      { userId: user.userId, total: result.total, page: result.page, action: 'list_sessions_success' },
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
