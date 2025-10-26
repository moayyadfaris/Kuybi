import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import type { StringValue } from 'ms'
import * as bcrypt from 'bcrypt'
import { UsersService } from '../../users/users.service'
import { User } from '../../users/entities/user.entity'
import { Session } from '../entities/session.entity'
import { SessionsService } from './sessions.service'
import { TokenBlacklistService } from './token-blacklist.service'

interface SessionContext {
  ipAddress?: string
  userAgent?: string
  deviceType?: string
}

interface ListSessionsOptions {
  page: number
  limit: number
  includeExpired: boolean
  sortBy?: 'createdAt' | 'expiresAt' | 'ipAddress'
  sortOrder?: 'asc' | 'desc'
  filterByDevice?: string
  filterByStatus?: 'active' | 'expired' | 'expiring'
  includeRiskAssessment: boolean
  anonymizeData: boolean
}

@Injectable()
export class AuthService {
  constructor(
    @InjectPinoLogger(AuthService.name)
    private readonly logger: PinoLogger,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
    private readonly tokenBlacklistService: TokenBlacklistService
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email)
    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash)
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials')
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is inactive')
    }

    return user
  }

  async login(user: User, context: SessionContext) {
    this.logger.info(
      { userId: user.id, email: user.email, ipAddress: context.ipAddress, deviceType: context.deviceType, action: 'user_login' },
      'User login'
    )
    
    // Create session using SessionsService
    const { session, refreshToken } = await this.sessionsService.createSession({
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      deviceType: context.deviceType,
      sessionType: 'standard'
    })

    // Generate access token
    const accessToken = await this.generateAccessToken(user)

    this.logger.info(
      { sessionId: session.id, userId: user.id, action: 'session_created' },
      'Session created for user'
    )

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    }
  }

  async refresh(refreshToken: string, context: SessionContext) {
    const [tokenId, tokenSecret] = refreshToken.split('.')
    if (!tokenId || !tokenSecret) {
      throw new UnauthorizedException('Invalid refresh token format')
    }

    // Validate session exists and is active
    const validationResult = await this.sessionsService.validateSession(tokenId)
    if (!validationResult.valid || !validationResult.session) {
      throw new UnauthorizedException(validationResult.reason || 'Invalid session')
    }

    const session = validationResult.session

    // Verify refresh token secret
    const isValid = await bcrypt.compare(tokenSecret, session.refreshTokenHash)
    if (!isValid) {
      await this.sessionsService.revokeSession(tokenId, 'invalid_token_secret')
      throw new UnauthorizedException('Invalid refresh token')
    }

    // Verify user is still active
    const user = await this.usersService.findById(session.userId)
    if (!user || !user.isActive) {
      await this.sessionsService.revokeSession(tokenId, 'user_inactive')
      throw new UnauthorizedException('User unavailable')
    }

    // Refresh session (creates new session, revokes old one)
    const { session: newSession, refreshToken: newRefreshToken } = await this.sessionsService.refreshSession(
      tokenId,
      {
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        deviceType: context.deviceType
      }
    )

    // Generate new access token
    const accessToken = await this.generateAccessToken(user)

    this.logger.info(
      { oldSessionId: tokenId, newSessionId: newSession.id, userId: user.id, action: 'session_refreshed' },
      'Session refreshed'
    )

    return {
      accessToken,
      refreshToken: newRefreshToken
    }
  }

  async logout(
    refreshToken: string,
    options: SessionContext & { userId: string; logoutAll?: boolean; reason?: string; accessToken?: string }
  ) {
    const { userId, logoutAll = false, reason, accessToken } = options
    const [tokenId, tokenSecret] = refreshToken.split('.')

    if (!tokenId || !tokenSecret) {
      throw new UnauthorizedException('Invalid refresh token format')
    }

    // Validate session
    const validationResult = await this.sessionsService.validateSession(tokenId)
    if (!validationResult.valid || !validationResult.session) {
      throw new UnauthorizedException(validationResult.reason || 'Invalid session')
    }

    const session = validationResult.session

    // Verify ownership
    if (session.userId !== userId) {
      throw new UnauthorizedException('Session does not belong to user')
    }

    // Verify refresh token secret
    const isValid = await bcrypt.compare(tokenSecret, session.refreshTokenHash)
    if (!isValid) {
      await this.sessionsService.revokeSession(tokenId, 'invalid_token_secret')
      throw new UnauthorizedException('Invalid refresh token')
    }

    // Blacklist the current access token immediately (if provided)
    let tokenBlacklisted = false
    if (accessToken) {
      try {
        const result = await this.tokenBlacklistService.blacklistToken(accessToken, {
          userId,
          sessionId: session.id,
          reason: reason || (logoutAll ? 'user_logout_all' : 'user_logout')
        })
        tokenBlacklisted = result.success
        this.logger.info(
          { userId, sessionId: session.id, tokenHash: result.tokenHash.substring(0, 16), action: 'access_token_blacklisted' },
          'Access token blacklisted on logout'
        )
      } catch (error) {
        this.logger.warn(
          { userId, sessionId: session.id, error: error.message, action: 'access_token_blacklist_failed' },
          'Failed to blacklist access token (non-critical)'
        )
      }
    }

    // Perform logout
    let sessionsInvalidated = 0
    if (logoutAll) {
      sessionsInvalidated = await this.sessionsService.revokeAllSessions(
        userId,
        undefined, // Don't exclude any session
        reason || 'user_logout_all'
      )
      this.logger.info(
        { userId, sessionsInvalidated, reason: reason || 'user_logout_all', action: 'logout_all_devices' },
        'User logged out from all devices'
      )
    } else {
      const success = await this.sessionsService.revokeSession(tokenId, reason || 'user_logout')
      sessionsInvalidated = success ? 1 : 0
      this.logger.info(
        { userId, sessionId: tokenId, reason: reason || 'user_logout', action: 'logout_session' },
        'User logged out from session'
      )
    }

    return {
      sessionsInvalidated,
      logoutType: logoutAll ? 'all_devices' : 'current_device',
      sessionId: session.id,
      cacheCleared: true, // SessionsService handles cache invalidation
      tokenBlacklisted // Indicates if access token was blacklisted
    }
  }

  async listSessions(userId: string, options: ListSessionsOptions) {
    // Get sessions using SessionsService
    const allSessions = await this.sessionsService.getActiveSessions(userId, options.includeExpired)
    const normalizedSessions = allSessions.map((session) => this.normalizeSessionDates(session))

    // Apply filters
    let filtered = normalizedSessions

    if (options.filterByDevice) {
      filtered = filtered.filter(
        (s) => s.deviceType?.toLowerCase() === options.filterByDevice?.toLowerCase()
      )
    }

    if (options.filterByStatus) {
      const now = Date.now()
      if (options.filterByStatus === 'active') {
        filtered = filtered.filter((s) => s.expiresAt.getTime() > now && s.isActive)
      } else if (options.filterByStatus === 'expired') {
        filtered = filtered.filter((s) => s.expiresAt.getTime() <= now || !s.isActive)
      } else if (options.filterByStatus === 'expiring') {
        const threshold = now + 24 * 60 * 60 * 1000
        filtered = filtered.filter((s) => {
          const expiresTime = s.expiresAt.getTime()
          return expiresTime > now && expiresTime <= threshold
        })
      }
    }

    // Apply sorting
    if (options.sortBy) {
      const sortField = options.sortBy
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1
      filtered.sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]
        if (aVal instanceof Date && bVal instanceof Date) {
          return (aVal.getTime() - bVal.getTime()) * sortOrder
        }
        return String(aVal).localeCompare(String(bVal)) * sortOrder
      })
    } else {
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }

    // Apply pagination
    const total = filtered.length
    const start = options.page * options.limit
    const paginated = filtered.slice(start, start + options.limit)

    // Map to response format
    const now = Date.now()
    const mapped = await Promise.all(
      paginated.map(async (session) => {
        const isExpired = session.expiresAt.getTime() <= now
        let risk

        if (options.includeRiskAssessment) {
          try {
            const assessment = await this.sessionsService.assessSessionRisk(session.id)
            risk = { level: assessment.riskLevel, reason: assessment.factors.join(', ') }
          } catch {
            risk = this.evaluateSessionRisk(session, isExpired)
          }
        }

        return {
          id: session.id,
          deviceType: session.deviceType,
          userAgent: session.userAgent,
          ipAddress: options.anonymizeData ? this.anonymizeIp(session.ipAddress) : session.ipAddress,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt,
          createdAt: session.createdAt,
          status: isExpired ? 'expired' : 'active',
          securityLevel: session.securityLevel,
          sessionType: session.sessionType,
          fingerprint: session.fingerprint,
          risk
        }
      })
    )

    return {
      total,
      page: options.page,
      limit: options.limit,
      sessions: mapped
    }
  }

  private normalizeSessionDates(session: Session): Session {
    session.createdAt = this.ensureDate(session.createdAt)
    session.updatedAt = this.ensureDate(session.updatedAt)
    session.lastActivityAt = this.ensureDate(session.lastActivityAt)
    session.expiresAt = this.ensureDate(session.expiresAt)
    session.deletedAt = session.deletedAt ? this.ensureDate(session.deletedAt) : undefined
    return session
  }

  private ensureDate(value?: Date | string | number | null): Date {
    if (value instanceof Date) {
      return value
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed
      }
    }

    return new Date(0)
  }

  private evaluateSessionRisk(session: Session, isExpired: boolean) {
    if (isExpired) {
      return { level: 'low', reason: 'Session already expired' }
    }

    const hoursUntilExpiry = (session.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntilExpiry < 1) {
      return { level: 'high', reason: 'Session expires in under an hour' }
    }

    if (hoursUntilExpiry < 24) {
      return { level: 'medium', reason: 'Session expires within 24 hours' }
    }

    return { level: 'low', reason: 'Session appears healthy' }
  }

  private anonymizeIp(ip?: string | null) {
    if (!ip) return ip
    if (ip.includes(':')) {
      const parts = ip.split(':')
      return `${parts.slice(0, 4).join(':')}::` // basic IPv6 masking
    }
    const segments = ip.split('.')
    if (segments.length !== 4) return ip
    return `${segments[0]}.${segments[1]}.***.***`
  }

  private async generateAccessToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role }
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('auth.jwtAccessExpiresIn') as StringValue
    })
  }
}
