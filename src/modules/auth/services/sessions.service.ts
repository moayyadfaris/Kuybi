import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ErrorCode } from '@shared/errors'
import { createHash, randomUUID } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { isIP } from 'net'
import { EntityManager } from 'typeorm'

import { hashTokenSecret } from '@core/security'

import { Session, SessionTypeValue } from '../entities/session.entity'
import { SessionRepository } from '../repositories/session.repository'

const DAY_MS = 24 * 60 * 60 * 1000
/** Furthest an extension may move a session's expiry, counted from now */
export const MAX_EXTENDED_DAYS = 30

export interface CreateSessionOptions {
  userId: string
  /** users.credentialsVersion read with the credentials that opened the session */
  credentialsVersion: number
  ipAddress?: string
  userAgent?: string
  deviceType?: string
  fingerprint?: string
  sessionType?: SessionTypeValue
  expiresInDays?: number
  metadata?: Record<string, unknown>
}

export interface SessionValidationResult {
  valid: boolean
  session?: Session
  reason?: string
}

/**
 * Server-side sessions behind refresh tokens.
 *
 * A session is created at login and replaced on every refresh (rotation: the old one is
 * revoked). Its id is the public half of the refresh token (`<id>.<secret>`); only a hash
 * of the secret is stored. Access tokens carry the session id and die with the session.
 * Each user has at most `auth.maxConcurrentSessions` live sessions: a new login revokes
 * the oldest ones beyond that.
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

  /** Creates a session and its refresh token (returned once, never stored in clear) */
  async createSession(
    options: CreateSessionOptions
  ): Promise<{ session: Session; refreshToken: string }> {
    const {
      userId,
      credentialsVersion,
      ipAddress,
      userAgent,
      deviceType,
      fingerprint,
      sessionType = 'standard',
      expiresInDays = this.defaultSessionDays,
      metadata = {}
    } = options

    await this.makeRoomForNewSession(userId)

    const tokenId = randomUUID()
    const tokenSecret = randomUUID()
    const detectedDeviceType = deviceType || detectDeviceType(userAgent)
    const expiresAt = new Date(Date.now() + expiresInDays * DAY_MS)

    const session = await this.sessionRepository.create({
      id: tokenId,
      userId,
      credentialsVersion,
      refreshTokenHash: hashTokenSecret(tokenSecret),
      fingerprint: fingerprint || deviceFingerprint(ipAddress, userAgent),
      deviceType: detectedDeviceType,
      userAgent,
      ipAddress,
      securityLevel: assessSecurityLevel({ ipAddress, userAgent, fingerprint, sessionType }),
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
        securityLevel: session.securityLevel,
        sessionType,
        deviceType: detectedDeviceType,
        action: 'create_session'
      },
      'Session created'
    )

    return { session, refreshToken: `${tokenId}.${tokenSecret}` }
  }

  /** A live session (also records the activity), or why there is none */
  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    const session = await this.sessionRepository.validateSession(sessionId)
    return session
      ? { valid: true, session }
      : { valid: false, reason: 'Session not found or expired' }
  }

  /**
   * Rotation: revokes the session and creates its successor (same device, fresh expiry).
   * The caller has already checked the refresh token's secret.
   */
  async refreshSession(
    sessionId: string,
    options: Partial<CreateSessionOptions>
  ): Promise<{ session: Session; refreshToken: string }> {
    // Fresh read: the cached copy has string dates and may predate a revocation
    const currentSession = await this.sessionRepository.findById(sessionId, { bypassCache: true })

    if (!currentSession || !currentSession.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Invalid session'
      })
    }

    if (currentSession.expiresAt.getTime() <= Date.now()) {
      await this.sessionRepository.revokeSession(sessionId, 'expired')
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Session expired'
      })
    }

    // The conditional revoke succeeds once: of two concurrent refreshes with the same
    // token, only the first gets a new session
    if (!(await this.sessionRepository.revokeSession(sessionId, 'refreshed'))) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
        message: 'Refresh token already used'
      })
    }

    return this.createSession({
      userId: currentSession.userId,
      // The caller checked it against the user's current version
      credentialsVersion: currentSession.credentialsVersion,
      ipAddress: options.ipAddress || currentSession.ipAddress,
      userAgent: options.userAgent || currentSession.userAgent,
      deviceType: options.deviceType || currentSession.deviceType,
      fingerprint: options.fingerprint || currentSession.fingerprint,
      sessionType: currentSession.sessionType,
      expiresInDays: this.defaultSessionDays,
      metadata: {
        ...currentSession.metadata,
        previousSessionId: sessionId,
        refreshedAt: new Date().toISOString()
      }
    })
  }

  /**
   * Pushes a session's expiry back by `days`, never past MAX_EXTENDED_DAYS from now
   * (the refresh token is valid until the session expires)
   * @returns the stored expiry
   */
  async extendSession(session: Session, days: number): Promise<Date> {
    const extended = new Date(session.expiresAt).getTime() + days * DAY_MS
    const expiresAt = new Date(Math.min(extended, Date.now() + MAX_EXTENDED_DAYS * DAY_MS))
    await this.sessionRepository.update(session.id, { expiresAt })
    this.logger.info(
      { sessionId: session.id, userId: session.userId, expiresAt },
      'Session extended'
    )
    return expiresAt
  }

  /** @returns false when the session was already gone or revoked */
  async revokeSession(sessionId: string, reason = 'manual_revocation'): Promise<boolean> {
    const result = await this.sessionRepository.revokeSession(sessionId, reason)
    if (result) {
      this.logger.info({ sessionId, reason, action: 'revoke_session' }, 'Session revoked')
    }
    return result
  }

  /**
   * Revokes every live session of the user, except `excludeSessionId` when given
   * @returns how many were revoked
   */
  /**
   * Ends the user's sessions (but `excludeSessionId`). With `manager` it is part of the
   * caller's transaction (a credential change): call dropSessionCache once it commits.
   */
  async revokeAllSessions(
    userId: string,
    excludeSessionId?: string,
    reason = 'revoke_all_request',
    manager?: EntityManager
  ): Promise<number> {
    const count = await this.sessionRepository.revokeAllUserSessions(
      userId,
      excludeSessionId,
      reason,
      manager
    )
    this.logger.info(
      { userId, count, excludeSessionId, reason, action: 'revoke_all_sessions' },
      'Revoked all user sessions'
    )
    return count
  }

  /** After a transaction that revoked sessions has committed (see revokeAllSessions) */
  async dropSessionCache(): Promise<void> {
    await this.sessionRepository.invalidateAllCaches()
  }

  /** Any session by id, revoked ones included (fresh read) */
  async getSessionById(sessionId: string) {
    return this.sessionRepository.findById(sessionId, { bypassCache: true })
  }

  /** The user's live sessions, or all of them with `includeInactive` */
  async getActiveSessions(userId: string, includeInactive = false): Promise<Session[]> {
    const sessions = await this.sessionRepository.findByUserId(userId, includeInactive)
    return sessions.map(withDatesAndRevokedAt)
  }

  async getSessionStats(userId: string) {
    return this.sessionRepository.getUserSessionStats(userId)
  }

  async assessSessionRisk(sessionId: string) {
    return this.sessionRepository.assessSecurityRisk(sessionId)
  }

  /** Hard-deletes sessions that ended more than `olderThanDays` ago */
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

  /** Live sessions per device type, across all users */
  async getDeviceStats() {
    return this.sessionRepository.getDeviceStats()
  }

  /**
   * Keeps the user under the concurrent-session limit once the new session exists:
   * revokes the oldest live sessions beyond `maxConcurrentSessions - 1`
   */
  private async makeRoomForNewSession(userId: string): Promise<void> {
    const activeCount = await this.sessionRepository.getActiveSessionCount(userId)
    if (activeCount < this.maxConcurrentSessions) return

    const oldestFirst = (await this.sessionRepository.findActiveByUserId(userId))
      .map(withDatesAndRevokedAt)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const excess = oldestFirst.slice(0, oldestFirst.length - this.maxConcurrentSessions + 1)

    this.logger.warn(
      {
        userId,
        activeCount,
        limit: this.maxConcurrentSessions,
        revoking: excess.length,
        action: 'concurrent_limit_exceeded'
      },
      'User reached the concurrent session limit; revoking the oldest sessions'
    )
    for (const session of excess) {
      await this.sessionRepository.revokeSession(session.id, 'concurrent_limit_exceeded')
    }
  }
}

/**
 * Sessions read from the cache are plain JSON (dates as strings). Restores the dates and
 * adds `revokedAt` for revoked sessions: from metadata (written by revocation; older rows
 * used snake_case), else deletedAt.
 */
function withDatesAndRevokedAt(session: Session): Session {
  const toDate = (value?: Date | string | number | null): Date => {
    const date = value instanceof Date ? value : new Date(value ?? 0)
    return isNaN(date.getTime()) ? new Date(0) : date
  }

  session.createdAt = toDate(session.createdAt)
  session.updatedAt = toDate(session.updatedAt)
  session.lastActivityAt = toDate(session.lastActivityAt)
  session.expiresAt = toDate(session.expiresAt)
  session.deletedAt = session.deletedAt ? toDate(session.deletedAt) : undefined

  // metadata is free-form jsonb: only accept values that can be a date
  const fromMetadata = [session.metadata?.revokedAt, session.metadata?.revoked_at].find(
    (value): value is string | number => typeof value === 'string' || typeof value === 'number'
  )
  const revokedAt = fromMetadata ?? session.deletedAt
  if (revokedAt) {
    ;(session as Session & { revokedAt?: Date }).revokedAt = toDate(revokedAt)
  }
  return session
}

/**
 * A coarse risk label stored with the session (shown in session lists, filterable).
 * Heuristic only: missing client signals and privileged session types score higher,
 * private-network and loopback addresses lower. Nothing is blocked on it.
 */
function assessSecurityLevel(context: {
  ipAddress?: string
  userAgent?: string
  fingerprint?: string
  sessionType?: string
}): 'low' | 'medium' | 'high' | 'critical' {
  let riskScore = 0

  if (!context.fingerprint) riskScore += 20
  if (!context.ipAddress) riskScore += 15
  if (!context.userAgent) riskScore += 10

  if (context.sessionType === 'admin') riskScore += 15
  if (context.sessionType === 'api') riskScore += 10
  if (context.sessionType === 'suspicious') riskScore += 40

  if (context.ipAddress && isLoopback(context.ipAddress)) riskScore -= 15
  else if (context.ipAddress && isPrivateIpv4(context.ipAddress)) riskScore -= 10

  if (riskScore >= 50) return 'critical'
  if (riskScore >= 30) return 'high'
  if (riskScore >= 10) return 'medium'
  return 'low'
}

const isLoopback = (ip: string) => ip === '::1' || ip.startsWith('127.')

/** RFC 1918: 10/8, 172.16/12, 192.168/16 */
export function isPrivateIpv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/** Device class from the user agent (substring heuristics) */
export function detectDeviceType(userAgent?: string): string {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()

  // Tablets first: iPad and Android tablet user agents also say "mobile" or "android"
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet'
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile'
  if (ua.includes('postman') || ua.includes('insomnia') || ua.includes('curl')) {
    return 'api-client'
  }
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) return 'bot'
  return 'desktop'
}

/**
 * Stand-in fingerprint when the client sends none: the same address and browser give the
 * same value, so sessions from one device can be grouped. A hash, so the stored value
 * does not reveal the address.
 */
export function deviceFingerprint(ipAddress?: string, userAgent?: string): string {
  const digest = createHash('sha256')
    .update(`${ipAddress ?? 'unknown'}|${userAgent ?? 'unknown'}`)
    .digest('hex')
  return `fp_${digest.slice(0, 32)}`
}
