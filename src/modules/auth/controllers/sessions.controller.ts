import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { seconds, Throttle } from '@nestjs/throttler'
import { errorMessage } from '@shared/utils/error.util'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { SuperAdminGuard } from '@modules/acl'
import { User } from '@modules/users/entities'

import { JwtAuthGuard } from '@core/auth'

import {
  DeviceType,
  ExtendSessionQueryDto,
  RevokeByDeviceDto,
  RevokeSessionDto,
  RevokeSessionResponseDto,
  SessionCleanupQueryDto,
  SessionFilterDto,
  SessionStatsDto
} from '../dto'
import { Session } from '../entities/session.entity'
import { SessionCleanupService, SessionsService } from '../services'
import {
  filterAndSortSessions,
  needsEndedSessions,
  shareOf,
  toListedSession
} from '../utils/session-list.util'

// The controller is guarded by JwtAuthGuard, so the user is always present
interface AuthenticatedRequest extends Request {
  user: User
}

/**
 * SessionsController with Pino Structured Logging
 */
@ApiTags('sessions')
@Controller('v1/sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    @InjectPinoLogger(SessionsController.name)
    private readonly logger: PinoLogger,
    private readonly sessionsService: SessionsService,
    private readonly cleanupService: SessionCleanupService
  ) {}

  @Get('me')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'List my sessions (current user)' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async getMySessionsExplicit(@Query() filter: SessionFilterDto, @Req() req: AuthenticatedRequest) {
    return this.listSessions(filter, req)
  }

  @Get()
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'List user sessions' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async listSessions(@Query() filter: SessionFilterDto, @Req() req: AuthenticatedRequest) {
    const startTime = Date.now()
    const userId = this.getUserId(req)

    this.logger.info({ userId, filter, action: 'list_sessions' }, 'Listing user sessions')

    const filtered = filterAndSortSessions(
      await this.sessionsService.getActiveSessions(userId, needsEndedSessions(filter)),
      filter
    )

    // Paginate
    const page = filter.page || 1
    const limit = filter.limit || 10
    const startIndex = (page - 1) * limit
    const paginated = filtered.slice(startIndex, startIndex + limit)

    // Add risk assessment if requested
    const mapped = await Promise.all(
      paginated.map(async session => {
        const sessionData: Record<string, unknown> = toListedSession(session, filter)
        if (filter.includeRiskAssessment) {
          try {
            sessionData.riskAssessment = await this.sessionsService.assessSessionRisk(session.id)
          } catch (error) {
            this.logger.warn(
              { sessionId: session.id, error: errorMessage(error) },
              'Risk assessment failed'
            )
          }
        }
        return sessionData
      })
    )

    const duration = Date.now() - startTime
    this.logger.info(
      { userId, count: mapped.length, total: filtered.length, duration },
      'Sessions listed'
    )

    return {
      pagination: {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit) || 1
      },
      sessions: mapped
    }
  }

  @Get('me/stats')
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Get my session statistics (current user)' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved', type: SessionStatsDto })
  async getMySessionStats(@Req() req: AuthenticatedRequest) {
    return this.getSessionStats(req)
  }

  @Get('stats')
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Get session statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved', type: SessionStatsDto })
  async getSessionStats(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req)
    this.logger.info({ userId, action: 'get_stats' }, 'Fetching session stats')

    const stats = await this.sessionsService.getSessionStats(userId)
    const result: SessionStatsDto = {
      totalSessions: stats.total,
      activeSessions: stats.active,
      expiredSessions: stats.expired,
      revokedSessions: stats.revoked || 0,
      expiringSoon: 0,
      suspiciousSessions: 0,
      deviceStats: shareOf('deviceType', stats.byDevice, stats.total),
      securityStats: shareOf('securityLevel', stats.bySecurityLevel, stats.total),
      typeStats: shareOf('sessionType', stats.bySessionType, stats.total),
      averageSessionAge: 0,
      mostRecentSession: stats.newestActive || null,
      oldestSession: stats.oldestActive || null,
      metadata: {}
    }

    this.logger.info(
      { userId, totalSessions: result.totalSessions, activeSessions: result.activeSessions },
      'Stats retrieved'
    )
    return result
  }

  @Get(':id')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Get session by ID' })
  @ApiParam({ name: 'id', description: 'Session ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Session retrieved' })
  async getSession(@Param('id') sessionId: string, @Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req)
    this.logger.info({ userId, sessionId, action: 'get_session' }, 'Fetching session')

    const session = await this.findOwnSession(sessionId, userId)
    const riskAssessment = await this.sessionsService.assessSessionRisk(sessionId)
    return { ...session, riskAssessment }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke session' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, type: RevokeSessionResponseDto })
  async revokeSession(
    @Param('id') sessionId: string,
    @Body() dto: RevokeSessionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<RevokeSessionResponseDto> {
    const userId = this.getUserId(req)
    this.logger.info(
      { userId, sessionId, reason: dto.reason, action: 'revoke_session' },
      'Revoking session'
    )

    await this.findOwnSession(sessionId, userId)
    const revoked = await this.sessionsService.revokeSession(sessionId, dto.reason || 'user_logout')
    if (!revoked) {
      // Revoked by another request since the check above
      throw new NotFoundException('Session not found or already revoked')
    }
    this.logger.info({ userId, sessionId }, 'Session revoked')

    return {
      sessionsRevoked: 1,
      logoutType: 'current_device' as const,
      revokedSessionIds: [sessionId],
      cacheCleared: true,
      message: `Session revoked (${dto.reason || 'user_logout'})`
    }
  }

  @Delete('all/revoke')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke all sessions' })
  @ApiResponse({ status: 200 })
  async revokeAllSessions(@Body() dto: RevokeSessionDto, @Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req)
    this.logger.info({ userId, reason: dto.reason, action: 'revoke_all' }, 'Revoking all sessions')

    const count = await this.sessionsService.revokeAllSessions(
      userId,
      undefined,
      dto.reason || 'user_logout_all'
    )
    this.logger.info({ userId, count }, 'All sessions revoked')

    return {
      sessionsRevoked: count,
      logoutType: 'all_devices',
      message: `Revoked ${count} session(s)`
    }
  }

  @Delete('device/:type')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke sessions by device' })
  @ApiParam({ name: 'type', enum: DeviceType })
  @ApiResponse({ status: 200, type: RevokeSessionResponseDto })
  async revokeByDeviceType(
    @Param('type') deviceType: string,
    @Body() dto: RevokeByDeviceDto,
    @Req() req: AuthenticatedRequest
  ): Promise<RevokeSessionResponseDto> {
    const userId = this.getUserId(req)
    this.logger.info({ userId, deviceType, action: 'revoke_by_device' }, 'Revoking by device')

    const validTypes = Object.values(DeviceType)
    if (!validTypes.includes(deviceType as DeviceType)) {
      throw new BadRequestException(`Invalid type. Must be: ${validTypes.join(', ')}`)
    }

    const sessions = await this.sessionsService.getActiveSessions(userId, false)
    const matching = sessions.filter(s => s.deviceType?.toLowerCase() === deviceType.toLowerCase())

    let revokedCount = 0
    const revokedIds: string[] = []

    for (const session of matching) {
      const success = await this.sessionsService.revokeSession(
        session.id,
        dto.reason || 'device_change'
      )
      if (success) {
        revokedCount++
        revokedIds.push(session.id)
      }
    }

    this.logger.info({ userId, deviceType, count: revokedCount }, 'Device sessions revoked')

    return {
      sessionsRevoked: revokedCount,
      logoutType: 'by_device_type' as const,
      revokedSessionIds: revokedIds,
      cacheCleared: true,
      message: `Revoked ${revokedCount} ${deviceType} session(s)`
    }
  }

  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Extend session expiration' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200 })
  async extendSession(
    @Param('id') sessionId: string,
    @Query() { days }: ExtendSessionQueryDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = this.getUserId(req)
    this.logger.info({ userId, sessionId, days, action: 'extend_session' }, 'Extending session')

    const session = await this.findOwnSession(sessionId, userId)
    const oldExpiresAt = new Date(session.expiresAt)
    const newExpiresAt = await this.sessionsService.extendSession(session, days)

    return {
      sessionId,
      oldExpiresAt,
      newExpiresAt,
      extensionDays: days,
      message: `Extended by ${days} day(s)`
    }
  }

  @Get('users/:userId')
  @UseGuards(SuperAdminGuard)
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'List sessions for any user (super-admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID to list sessions for' })
  @ApiResponse({ status: 200, description: 'User sessions retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super-admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async listUserSessions(
    @Param('userId') userId: string,
    @Query() filter: SessionFilterDto,
    @Req() req: AuthenticatedRequest
  ) {
    const startTime = Date.now()
    const adminUser = req.user

    this.logger.info(
      {
        adminUserId: adminUser.id,
        targetUserId: userId,
        filter,
        action: 'admin_list_user_sessions'
      },
      'Super-admin listing user sessions'
    )

    const allSessions = await this.sessionsService.getActiveSessions(
      userId,
      needsEndedSessions(filter)
    )
    const filtered = filterAndSortSessions(allSessions, filter)

    const duration = Date.now() - startTime

    this.logger.info(
      {
        adminUserId: adminUser.id,
        targetUserId: userId,
        totalSessions: allSessions.length,
        filteredSessions: filtered.length,
        duration,
        action: 'admin_list_user_sessions_success'
      },
      'Super-admin user sessions list completed'
    )

    return {
      userId,
      sessions: filtered.map(session => toListedSession(session, filter)),
      total: allSessions.length,
      filtered: filtered.length,
      message: `Found ${filtered.length} session(s) for user`
    }
  }

  @Delete('users/:userId/sessions/:sessionId')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke specific session for any user (super-admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'sessionId', description: 'Session ID to revoke' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super-admin access required' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeUserSession(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: RevokeSessionDto,
    @Req() req: AuthenticatedRequest
  ) {
    const adminUser = req.user

    this.logger.info(
      {
        adminUserId: adminUser.id,
        targetUserId: userId,
        sessionId,
        reason: body.reason,
        action: 'admin_revoke_user_session'
      },
      'Super-admin revoking user session'
    )

    // Verify the session belongs to the specified user
    const session = await this.sessionsService.getSessionById(sessionId)
    if (!session) {
      throw new NotFoundException('Session not found')
    }

    if (session.userId !== userId) {
      throw new BadRequestException('Session does not belong to specified user')
    }

    const revoked = await this.sessionsService.revokeSession(
      sessionId,
      body.notes || body.reason || 'Revoked by super-admin'
    )
    if (!revoked) {
      throw new NotFoundException('Session not found or already revoked')
    }

    this.logger.info(
      {
        adminUserId: adminUser.id,
        targetUserId: userId,
        sessionId,
        action: 'admin_revoke_user_session_success'
      },
      'Super-admin revoked user session'
    )

    return { sessionId, userId, message: 'Session revoked successfully' }
  }

  @Delete('users/:userId/sessions')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke all sessions for any user (super-admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'All user sessions revoked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super-admin access required' })
  async revokeAllUserSessions(
    @Param('userId') userId: string,
    @Body() body: RevokeSessionDto,
    @Req() req: AuthenticatedRequest
  ) {
    const adminUser = req.user

    this.logger.info(
      {
        adminUserId: adminUser.id,
        targetUserId: userId,
        reason: body.reason,
        action: 'admin_revoke_all_user_sessions'
      },
      'Super-admin revoking all user sessions'
    )

    const count = await this.sessionsService.revokeAllUserSessions(
      userId,
      body.notes || body.reason || 'All sessions revoked by super-admin'
    )

    this.logger.info(
      {
        adminUserId: adminUser.id,
        targetUserId: userId,
        sessionsRevoked: count,
        action: 'admin_revoke_all_user_sessions_success'
      },
      'Super-admin revoked all user sessions'
    )

    return {
      userId,
      sessionsRevoked: count,
      message: `Successfully revoked ${count} session(s)`
    }
  }

  @Post('cleanup')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: seconds(300) } })
  @ApiOperation({ summary: 'Manual cleanup (super-admin only)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Forbidden - Super-admin access required' })
  async manualCleanup(
    @Query() { olderThanDays }: SessionCleanupQueryDto,
    @Req() req: AuthenticatedRequest
  ) {
    const user = req.user

    this.logger.info(
      { adminUserId: user.id, olderThanDays, action: 'manual_cleanup' },
      'Starting cleanup'
    )

    const startTime = Date.now()
    const deletedCount = await this.cleanupService.manualCleanup(olderThanDays)
    const duration = Date.now() - startTime

    this.logger.info({ adminUserId: user.id, deletedCount, duration }, 'Cleanup completed')

    return {
      sessionsDeleted: deletedCount,
      olderThanDays,
      duration,
      message: `Deleted ${deletedCount} session(s)`
    }
  }

  /** A live session of the caller: 404 when missing or ended, 403 when someone else's */
  private async findOwnSession(sessionId: string, userId: string): Promise<Session> {
    const validation = await this.sessionsService.validateSession(sessionId)
    if (!validation.valid || !validation.session) {
      throw new NotFoundException('Session not found')
    }
    if (validation.session.userId !== userId) {
      this.logger.warn(
        { userId, sessionId, ownerId: validation.session.userId },
        "Access to another user's session denied"
      )
      throw new ForbiddenException('Access denied')
    }
    return validation.session
  }

  private getUserId(req: AuthenticatedRequest): string {
    const user = req.user
    if (!user?.id) {
      this.logger.error('User not authenticated')
      throw new UnauthorizedException('Not authenticated')
    }
    return user.id
  }
}
