import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { Session } from '../entities/session.entity'
import { SessionRepository } from '@core/database/repositories/session.repository'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'

export interface CreateSessionOptions {
  userId: string
  ipAddress?: string
  userAgent?: string
  deviceType?: string
  fingerprint?: string
  sessionType?: 'standard' | 'persistent' | 'mobile' | 'api' | 'admin' | 'suspicious' | 'guest'
  expiresInDays?: number
  metadata?: Record<string, any>
}

export interface SessionValidationResult {
  valid: boolean
  session?: Session
  reason?: string
}

export interface DeviceSessionsFilter {
  userId: string
  deviceType: string
}

/**
 * Sessions Service - Enterprise Session Management Business Logic
 *
 * Features:
 * - Multi-device session management with device fingerprinting
 * - Automatic security risk assessment
 * - Concurrent session limiting
 * - Session lifecycle management (create, validate, refresh, revoke)
 * - Device detection and IP geolocation
 * - Comprehensive analytics and statistics
 *
 * Security:
 * - Automatic risk scoring based on session patterns
 * - Suspicious session detection
 * - IP-based anomaly detection
 * - Session replay attack prevention
 *
 * Performance:
 * - Automatic caching via SessionRepository
 * - Batch operations for mass revocation
 * - Efficient cleanup of expired sessions
 */
@Injectable()
export class SessionsService {
  private readonly maxConcurrentSessions: number
  private readonly defaultSessionDays: number

  constructor(
    @InjectPinoLogger(SessionsService.name)
    private readonly logger: PinoLogger,
    private readonly sessionRepository: SessionRepository,
    private readonly configService: ConfigService
  ) {
    this.maxConcurrentSessions = this.configService.get<number>('auth.maxConcurrentSessions', 5)
    this.defaultSessionDays = this.configService.get<number>('auth.sessionDays', 7)
  }

  /**
   * Create a new session with security assessment
   * @param options - Session creation options
   * @returns Promise<{ session: Session; refreshToken: string }>
   */
  async createSession(
    options: CreateSessionOptions
  ): Promise<{ session: Session; refreshToken: string }> {
    const {
      userId,
      ipAddress,
      userAgent,
      deviceType,
      fingerprint,
      sessionType = 'standard',
      expiresInDays = this.defaultSessionDays,
      metadata = {}
    } = options

    // Check concurrent session limit
    const activeCount = await this.sessionRepository.getActiveSessionCount(userId)
    if (activeCount >= this.maxConcurrentSessions) {
      this.logger.warn(
        {
          userId,
          activeCount,
          limit: this.maxConcurrentSessions,
          action: 'concurrent_limit_exceeded'
        },
        'User exceeded concurrent session limit'
      )
      // Revoke oldest session
      const sessions = (await this.sessionRepository.findActiveByUserId(userId)).map(session =>
        this.normalizeSessionDates(session)
      )
      if (sessions.length > 0) {
        const oldest = sessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
        await this.sessionRepository.revokeSession(oldest.id, 'concurrent_limit_exceeded')
      }
    }

    // Generate refresh token
    const tokenId = randomUUID()
    const tokenSecret = randomUUID()
    const refreshToken = `${tokenId}.${tokenSecret}`
    const refreshTokenHash = await bcrypt.hash(tokenSecret, 10)

    // Assess security risk
    const securityLevel = this.assessSecurityLevel({
      ipAddress,
      userAgent,
      fingerprint,
      sessionType
    })

    // Detect device type if not provided
    const detectedDeviceType = deviceType || this.detectDeviceType(userAgent)

    // Create session
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    const session = await this.sessionRepository.create({
      id: tokenId,
      userId,
      refreshTokenHash,
      fingerprint: fingerprint || this.generateFingerprint({ ipAddress, userAgent }),
      deviceType: detectedDeviceType,
      userAgent,
      ipAddress,
      securityLevel,
      sessionType,
      isActive: true,
      lastActivityAt: new Date(),
      expiresAt,
      metadata: {
        ...metadata,
        createdFrom: ipAddress,
        initialUserAgent: userAgent,
        deviceDetected: detectedDeviceType
      }
    })

    this.logger.info(
      {
        userId,
        sessionId: session.id,
        securityLevel,
        sessionType,
        deviceType: detectedDeviceType,
        action: 'create_session'
      },
      'Session created'
    )

    return {
      session,
      refreshToken
    }
  }

  /**
   * Validate and refresh session activity
   * @param sessionId - Session ID
   * @returns Promise<SessionValidationResult>
   */
  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    const session = await this.sessionRepository.validateSession(sessionId)

    if (!session) {
      return {
        valid: false,
        reason: 'Session not found or expired'
      }
    }

    return {
      valid: true,
      session
    }
  }

  /**
   * Refresh session and rotate tokens
   * @param sessionId - Current session ID
   * @param options - Refresh options
   * @returns Promise<{ session: Session; refreshToken: string }>
   */
  async refreshSession(
    sessionId: string,
    options: Partial<CreateSessionOptions>
  ): Promise<{ session: Session; refreshToken: string }> {
    // Bypass cache to ensure we get fresh Session entity with all properties
    const currentSession = await this.sessionRepository.findById(sessionId, { bypassCache: true })

    if (!currentSession || !currentSession.isActive) {
      throw new UnauthorizedException('Invalid session')
    }

    if (currentSession.expiresAt.getTime() <= Date.now()) {
      await this.sessionRepository.revokeSession(sessionId, 'expired')
      throw new UnauthorizedException('Session expired')
    }

    // Revoke old session
    await this.sessionRepository.revokeSession(sessionId, 'refreshed')

    // Create new session
    return this.createSession({
      userId: currentSession.userId,
      ipAddress: options.ipAddress || currentSession.ipAddress,
      userAgent: options.userAgent || currentSession.userAgent,
      deviceType: options.deviceType || currentSession.deviceType,
      fingerprint: options.fingerprint || currentSession.fingerprint,
      sessionType: currentSession.sessionType as any,
      expiresInDays: this.defaultSessionDays,
      metadata: {
        ...currentSession.metadata,
        previousSessionId: sessionId,
        refreshedAt: new Date().toISOString()
      }
    })
  }

  /**
   * Revoke a specific session
   * @param sessionId - Session ID
   * @param reason - Revocation reason
   * @returns Promise<boolean>
   */
  async revokeSession(sessionId: string, reason?: string): Promise<boolean> {
    const result = await this.sessionRepository.revokeSession(
      sessionId,
      reason || 'manual_revocation'
    )
    if (result) {
      this.logger.info(
        { sessionId, reason: reason || 'manual_revocation', action: 'revoke_session' },
        'Session revoked'
      )
    }
    return result
  }

  /**
   * Revoke all sessions for a user
   * @param userId - User ID
   * @param excludeSessionId - Session ID to keep active
   * @param reason - Revocation reason
   * @returns Promise<number> - Number of sessions revoked
   */
  async revokeAllSessions(
    userId: string,
    excludeSessionId?: string,
    reason?: string
  ): Promise<number> {
    const count = await this.sessionRepository.revokeAllUserSessions(
      userId,
      excludeSessionId,
      reason || 'revoke_all_request'
    )
    this.logger.info(
      {
        userId,
        count,
        excludeSessionId,
        reason: reason || 'revoke_all_request',
        action: 'revoke_all_sessions'
      },
      'Revoked all user sessions'
    )
    return count
  }

  /**
   * Get session by ID
   * @param sessionId - Session ID
   * @returns Promise<Session | null>
   */
  async getSessionById(sessionId: string) {
    return this.sessionRepository.findById(sessionId, { bypassCache: true })
  }

  /**
   * Revoke all sessions for a user (admin function)
   * @param userId - User ID
   * @param reason - Revocation reason
   * @returns Promise<number> - Number of sessions revoked
   */
  async revokeAllUserSessions(userId: string, reason?: string): Promise<number> {
    return this.revokeAllSessions(userId, undefined, reason)
  }

  /**
   * Revoke sessions by device type
   * @param filter - Device sessions filter
   * @returns Promise<number>
   */
  async revokeDeviceSessions(filter: DeviceSessionsFilter): Promise<number> {
    const count = await this.sessionRepository.revokeByDeviceType(filter.userId, filter.deviceType)
    this.logger.info(
      {
        userId: filter.userId,
        deviceType: filter.deviceType,
        count,
        action: 'revoke_device_sessions'
      },
      'Revoked device sessions'
    )
    return count
  }

  /**
   * Get active sessions for a user
   * @param userId - User ID
   * @param includeInactive - Include inactive sessions
   * @returns Promise<Session[]>
   */
  async getActiveSessions(userId: string, includeInactive = false): Promise<Session[]> {
    const sessions = await this.sessionRepository.findByUserId(userId, includeInactive)
    return sessions.map(session => this.normalizeSessionDates(session))
  }

  /**
   * Get comprehensive session statistics for a user
   * @param userId - User ID
   * @returns Promise<object>
   */
  async getSessionStats(userId: string) {
    return this.sessionRepository.getUserSessionStats(userId)
  }

  /**
   * Assess security risk for a specific session
   * @param sessionId - Session ID
   * @returns Promise<object>
   */
  async assessSessionRisk(sessionId: string) {
    return this.sessionRepository.assessSecurityRisk(sessionId)
  }

  /**
   * Cleanup expired sessions (hard delete)
   * @param olderThanDays - Delete sessions older than X days
   * @returns Promise<{ deleted: number; timestamp: string }>
   */
  async cleanupExpiredSessions(
    olderThanDays = 30
  ): Promise<{ deleted: number; timestamp: string }> {
    const deleted = await this.sessionRepository.cleanupExpired(olderThanDays)
    const timestamp = new Date().toISOString()
    this.logger.info(
      { deleted, olderThanDays, timestamp, action: 'cleanup_expired_sessions' },
      'Cleaned up expired sessions'
    )
    return { deleted, timestamp }
  }

  /**
   * Handle concurrent session limit enforcement
   * @param userId - User ID
   * @returns Promise<void>
   */
  async handleConcurrentSessions(userId: string): Promise<void> {
    const activeCount = await this.sessionRepository.getActiveSessionCount(userId)

    if (activeCount > this.maxConcurrentSessions) {
      const sessions = (await this.sessionRepository.findActiveByUserId(userId)).map(session =>
        this.normalizeSessionDates(session)
      )
      const sortedSessions = sessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

      const toRevoke = sortedSessions.slice(0, activeCount - this.maxConcurrentSessions)

      for (const session of toRevoke) {
        await this.sessionRepository.revokeSession(session.id, 'concurrent_limit_enforcement')
      }

      this.logger.warn(
        `Enforced concurrent session limit for user ${userId}: revoked ${toRevoke.length} oldest sessions`
      )
    }
  }

  /**
   * Get global device statistics
   * @returns Promise<object>
   */
  async getDeviceStats() {
    return this.sessionRepository.getDeviceStats()
  }

  /**
   * Find suspicious sessions across the platform
   * @returns Promise<Session[]>
   */
  async findSuspiciousSessions(): Promise<Session[]> {
    return this.sessionRepository.findSuspiciousSessions()
  }

  /**
   * Normalize all date fields in a session object
   * Ensures all date values are proper Date objects, not strings or numbers
   * Also computes dynamic revokedAt property from metadata or deletedAt
   *
   * @param session - Session entity to normalize
   * @returns Session with normalized dates and computed revokedAt property
   * @private
   */
  private normalizeSessionDates(session: Session): Session {
    const ensureDate = (value?: Date | string | number | null): Date => {
      if (value instanceof Date) return value
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value)
        return isNaN(date.getTime()) ? new Date(0) : date
      }
      return new Date(0)
    }

    session.createdAt = ensureDate(session.createdAt)
    session.updatedAt = ensureDate(session.updatedAt)
    session.lastActivityAt = ensureDate(session.lastActivityAt)
    session.expiresAt = ensureDate(session.expiresAt)
    session.deletedAt = session.deletedAt ? ensureDate(session.deletedAt) : undefined

    // Add dynamic revokedAt property if session has been revoked
    this.addRevokedAtProperty(session, ensureDate)

    return session
  }

  /**
   * Dynamically adds revokedAt property to session objects for API responses
   *
   * Checks multiple sources in priority order for backward compatibility:
   * 1. metadata.revokedAt (preferred format)
   * 2. metadata.revoked_at (snake_case legacy format)
   * 3. deletedAt (fallback for sessions without metadata)
   *
   * The property is only added if revocation data exists, maintaining a clean API response.
   * Uses type-safe casting to extend the Session interface without modifying the entity schema.
   *
   * @param session - Session entity to enhance with revokedAt property
   * @param ensureDate - Date normalization function to ensure consistent Date objects
   * @private
   */
  private addRevokedAtProperty(
    session: Session,
    ensureDate: (value?: Date | string | number | null) => Date
  ): void {
    // Check multiple sources for revocation timestamp (backward compatibility)
    const revokedAtSource =
      session.metadata?.revokedAt ||
      session.metadata?.revoked_at ||
      (session.deletedAt ? session.deletedAt : undefined)

    if (revokedAtSource) {
      const revokedAtDate = ensureDate(revokedAtSource)

      // Log revocation detection for debugging
      this.logger.debug(
        {
          sessionId: session.id,
          userId: session.userId,
          revokedAtSource: typeof revokedAtSource,
          revokedAtDate: revokedAtDate.toISOString(),
          source: session.metadata?.revokedAt
            ? 'metadata.revokedAt'
            : session.metadata?.revoked_at
              ? 'metadata.revoked_at'
              : 'deletedAt',
          action: 'add_revoked_at_property'
        },
        'Added dynamic revokedAt property to session'
      )

      // Type-safe extension: add revokedAt without modifying entity schema
      ;(session as Session & { revokedAt?: Date }).revokedAt = revokedAtDate
    }
  }

  /**
   * Assess security level based on session characteristics
   * @private
   */
  private assessSecurityLevel(context: {
    ipAddress?: string
    userAgent?: string
    fingerprint?: string
    sessionType?: string
  }): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 0

    // Check for missing security indicators
    if (!context.fingerprint) riskScore += 20
    if (!context.ipAddress) riskScore += 15
    if (!context.userAgent) riskScore += 10

    // Check session type
    if (context.sessionType === 'admin') riskScore += 15
    if (context.sessionType === 'api') riskScore += 10
    if (context.sessionType === 'suspicious') riskScore += 40

    // Basic IP analysis (simplified)
    if (context.ipAddress) {
      // Check for private IPs (lower risk)
      if (
        context.ipAddress.startsWith('192.168.') ||
        context.ipAddress.startsWith('10.') ||
        context.ipAddress.startsWith('172.')
      ) {
        riskScore -= 10
      }
      // Check for localhost
      if (context.ipAddress === '127.0.0.1' || context.ipAddress === '::1') {
        riskScore -= 15
      }
    }

    // Determine level
    if (riskScore >= 50) return 'critical'
    if (riskScore >= 30) return 'high'
    if (riskScore >= 10) return 'medium'
    return 'low'
  }

  /**
   * Detect device type from user agent
   * @private
   */
  private detectDeviceType(userAgent?: string): string {
    if (!userAgent) return 'unknown'

    const ua = userAgent.toLowerCase()

    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile'
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet'
    }
    if (ua.includes('postman') || ua.includes('insomnia') || ua.includes('curl')) {
      return 'api-client'
    }
    if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
      return 'bot'
    }

    return 'desktop'
  }

  /**
   * Generate device fingerprint
   * @private
   */
  private generateFingerprint(context: { ipAddress?: string; userAgent?: string }): string {
    const parts = [
      context.ipAddress || 'unknown',
      context.userAgent || 'unknown',
      Date.now().toString()
    ]

    // Simple hash (in production, use a proper fingerprinting library)
    const hash = Buffer.from(parts.join('|')).toString('base64').substring(0, 32)
    return `fp_${hash}`
  }
}
