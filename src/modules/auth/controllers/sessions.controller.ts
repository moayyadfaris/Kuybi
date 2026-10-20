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
  ParseEnumPipe,
  Post,
  Query,
  Req,
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
import { SessionsService } from '../services'
import {
  filterAndSortSessions,
  needsEndedSessions,
  shareOf,
  toListedSession
} from '../utils/session-list.util'

// JwtAuthGuard guards the whole controller, so the user is always present
interface AuthenticatedRequest extends Request {
  user: User
}

/**
 * The signed-in user's sessions (list, inspect, revoke, extend), plus super-admin
 * endpoints for any user's sessions and the manual cleanup. Requests are logged by the
 * HTTP logger; handlers log only what an audit needs (revocations, denied access).
 */
@ApiTags('sessions')
@Controller('v1/sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    @InjectPinoLogger(SessionsController.name)
    private readonly logger: PinoLogger,
    private readonly sessionsService: SessionsService
  ) {}

  @Get('me')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'List my sessions (same as GET /v1/sessions)' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async listMySessions(@Query() filter: SessionFilterDto, @Req() req: AuthenticatedRequest) {
    return this.listSessions(filter, req)
  }

  @Get()
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'List my sessions' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async listSessions(@Query() filter: SessionFilterDto, @Req() req: AuthenticatedRequest) {
    const filtered = filterAndSortSessions(
      await this.sessionsService.getActiveSessions(req.user.id, needsEndedSessions(filter)),
      filter
    )

    const page = filter.page || 1
    const limit = filter.limit || 10
    const pageOfSessions = filtered.slice((page - 1) * limit, page * limit)

    const sessions = await Promise.all(
      pageOfSessions.map(async session => {
        const listed: Record<string, unknown> = toListedSession(session, filter)
        if (filter.includeRiskAssessment) {
          // Optional extra: a failed assessment must not fail the list
          try {
            listed.riskAssessment = await this.sessionsService.assessSessionRisk(session.id)
          } catch (error) {
            this.logger.warn(
              { sessionId: session.id, error: errorMessage(error) },
              'Risk assessment failed'
            )
          }
        }
        return listed
      })
    )

    return {
      pagination: {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit) || 1
      },
      sessions
    }
  }

  @Get('me/stats')
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({ summary: 'My session statistics (same as GET /v1/sessions/stats)' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved', type: SessionStatsDto })
  async getMySessionStats(@Req() req: AuthenticatedRequest) {
    return this.getSessionStats(req)
  }

  @Get('stats')
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({ summary: 'My session statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved', type: SessionStatsDto })
  async getSessionStats(@Req() req: AuthenticatedRequest): Promise<SessionStatsDto> {
    const stats = await this.sessionsService.getSessionStats(req.user.id)
    return {
      totalSessions: stats.total,
      activeSessions: stats.active,
      expiredSessions: stats.expired,
      revokedSessions: stats.revoked,
      expiringSoon: stats.expiringSoon,
      suspiciousSessions: stats.suspicious,
      deviceStats: shareOf('deviceType', stats.byDevice, stats.total),
      securityStats: shareOf('securityLevel', stats.bySecurityLevel, stats.total),
      typeStats: shareOf('sessionType', stats.bySessionType, stats.total),
      averageSessionAge: stats.averageAgeHours,
      mostRecentSession: stats.newestActive || null,
      oldestSession: stats.oldestActive || null,
      metadata: {}
    }
  }

  @Get(':id')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  @ApiOperation({ summary: 'One of my sessions, with its risk assessment' })
  @ApiParam({ name: 'id', description: 'Session ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Session retrieved' })
  async getSession(@Param('id') sessionId: string, @Req() req: AuthenticatedRequest) {
    const session = await this.findOwnSession(sessionId, req.user.id)
    const riskAssessment = await this.sessionsService.assessSessionRisk(sessionId)
    return { ...session, riskAssessment }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke one of my sessions' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, type: RevokeSessionResponseDto })
  async revokeSession(
    @Param('id') sessionId: string,
    @Body() dto: RevokeSessionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<RevokeSessionResponseDto> {
    const reason = dto.reason || 'user_logout'
    await this.findOwnSession(sessionId, req.user.id)
    if (!(await this.sessionsService.revokeSession(sessionId, reason))) {
      // Revoked by another request since the check above
      throw new NotFoundException('Session not found or already revoked')
    }

    return {
      sessionsRevoked: 1,
      logoutType: 'current_device' as const,
      revokedSessionIds: [sessionId],
      cacheCleared: true,
      message: `Session revoked (${reason})`
    }
  }

  @Delete('all/revoke')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke all my sessions, this one included' })
  @ApiResponse({ status: 200 })
  async revokeAllSessions(@Body() dto: RevokeSessionDto, @Req() req: AuthenticatedRequest) {
    const count = await this.sessionsService.revokeAllSessions(
      req.user.id,
      undefined,
      dto.reason || 'user_logout_all'
    )
    return {
      sessionsRevoked: count,
      logoutType: 'all_devices',
      message: `Revoked ${count} session(s)`
    }
  }

  @Delete('device/:type')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke my sessions on one device type' })
  @ApiParam({ name: 'type', enum: DeviceType })
  @ApiResponse({ status: 200, type: RevokeSessionResponseDto })
  async revokeByDeviceType(
    @Param('type', new ParseEnumPipe(DeviceType)) deviceType: DeviceType,
    @Body() dto: RevokeByDeviceDto,
    @Req() req: AuthenticatedRequest
  ): Promise<RevokeSessionResponseDto> {
    const sessions = await this.sessionsService.getActiveSessions(req.user.id, false)
    const revokedSessionIds: string[] = []

    for (const session of sessions.filter(s => s.deviceType?.toLowerCase() === deviceType)) {
      if (await this.sessionsService.revokeSession(session.id, dto.reason || 'device_change')) {
        revokedSessionIds.push(session.id)
      }
    }

    return {
      sessionsRevoked: revokedSessionIds.length,
      logoutType: 'by_device_type' as const,
      revokedSessionIds,
      cacheCleared: true,
      message: `Revoked ${revokedSessionIds.length} ${deviceType} session(s)`
    }
  }

  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Extend one of my sessions (at most 30 days from now)' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200 })
  async extendSession(
    @Param('id') sessionId: string,
    @Query() { days }: ExtendSessionQueryDto,
    @Req() req: AuthenticatedRequest
  ) {
    const session = await this.findOwnSession(sessionId, req.user.id)
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
  @ApiOperation({ summary: 'List any user’s sessions (super-admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID to list sessions for' })
  @ApiResponse({ status: 200, description: 'User sessions (empty for an unknown user)' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super-admin access required' })
  async listUserSessions(@Param('userId') userId: string, @Query() filter: SessionFilterDto) {
    const allSessions = await this.sessionsService.getActiveSessions(
      userId,
      needsEndedSessions(filter)
    )
    const filtered = filterAndSortSessions(allSessions, filter)

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
  @ApiOperation({ summary: 'Revoke one session of any user (super-admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'sessionId', description: 'Session ID to revoke' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  @ApiResponse({ status: 400, description: 'Session does not belong to the user' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super-admin access required' })
  @ApiResponse({ status: 404, description: 'Session not found or already revoked' })
  async revokeUserSession(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: RevokeSessionDto,
    @Req() req: AuthenticatedRequest
  ) {
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
      { adminUserId: req.user.id, targetUserId: userId, sessionId, action: 'admin_revoke_session' },
      'Super-admin revoked a user session'
    )
    return { sessionId, userId, message: 'Session revoked successfully' }
  }

  @Delete('users/:userId/sessions')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  @ApiOperation({ summary: 'Revoke all sessions of any user (super-admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'All user sessions revoked successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super-admin access required' })
  async revokeAllUserSessions(
    @Param('userId') userId: string,
    @Body() body: RevokeSessionDto,
    @Req() req: AuthenticatedRequest
  ) {
    const count = await this.sessionsService.revokeAllSessions(
      userId,
      undefined,
      body.notes || body.reason || 'All sessions revoked by super-admin'
    )

    this.logger.info(
      {
        adminUserId: req.user.id,
        targetUserId: userId,
        sessionsRevoked: count,
        action: 'admin_revoke_all_sessions'
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
  @ApiOperation({ summary: 'Delete sessions that ended long ago (super-admin only)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Forbidden - Super-admin access required' })
  async manualCleanup(
    @Query() { olderThanDays }: SessionCleanupQueryDto,
    @Req() req: AuthenticatedRequest
  ) {
    const startTime = Date.now()
    const { deleted: deletedCount } =
      await this.sessionsService.cleanupExpiredSessions(olderThanDays)
    const duration = Date.now() - startTime

    this.logger.info(
      { adminUserId: req.user.id, olderThanDays, deletedCount, duration },
      'Manual session cleanup completed'
    )
    return {
      sessionsDeleted: deletedCount,
      olderThanDays,
      duration,
      message: `Deleted ${deletedCount} session(s)`
    }
  }

  /**
   * A live session of the caller: 404 when missing or ended, 403 when someone else's
   * (session ids are random UUIDs, so the 403 reveals nothing guessable)
   */
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
}
