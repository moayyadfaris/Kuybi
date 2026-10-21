import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { Session } from '../entities/session.entity'

/**
 * Records the revocation reason and time in metadata. The reason is bound as a parameter
 * (`:revocationReason`), never interpolated: it can contain user-controlled text such as
 * an administrator's email address.
 */
const REVOCATION_METADATA_SQL = `COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object('revocationReason', CAST(:revocationReason AS text), 'revokedAt', to_jsonb(now()))`

/** Upper bound on serving a cached access status if an invalidation is missed (seconds) */
const ACCESS_STATUS_TTL = 30

/** Activity is recorded at most this often per session, so reads do not become writes */
const ACTIVITY_WRITE_INTERVAL_MS = 60_000

interface AccessStatus {
  active: boolean
  /** epoch milliseconds */
  expiresAt: number
}

/**
 * Sessions table. A session is live while isActive, not soft-deleted (deletedAt) and not
 * expired; revocation sets isActive = false and deletedAt, and records the reason in
 * metadata. Revoked rows are kept until cleanupExpired().
 */
@Injectable()
export class SessionRepository extends BaseRepository<Session> {
  protected entityName = 'session'
  protected defaultTTL = 300

  constructor(
    @InjectPinoLogger(SessionRepository.name)
    private readonly logger: PinoLogger,
    @InjectRepository(Session)
    protected readonly repository: Repository<Session>,
    protected readonly cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /** The user's live sessions (most recently used first), or all of them */
  async findByUserId(userId: string, includeInactive = false): Promise<Session[]> {
    const cacheKey = this.buildCacheKey('user', userId, includeInactive ? 'all' : 'active')

    return this.cached(cacheKey, async () => {
      const query = this.repository
        .createQueryBuilder('session')
        .where('session.userId = :userId', { userId })

      if (!includeInactive) {
        query.andWhere('session.deletedAt IS NULL')
        query.andWhere('session.isActive = :isActive', { isActive: true })
        query.andWhere('session.expiresAt > :now', { now: new Date() })
      }

      return query.orderBy('session.lastActivityAt', 'DESC').getMany()
    })
  }

  async findActiveByUserId(userId: string): Promise<Session[]> {
    return this.findByUserId(userId, false)
  }

  /**
   * The session if it is live (fresh read), recording the activity. An expired session is
   * revoked on the way. Activity is written at most once a minute: each write clears the
   * session caches.
   */
  async validateSession(sessionId: string): Promise<Session | null> {
    const session = await this.findById(sessionId, { bypassCache: true })

    if (!session || session.deletedAt || !session.isActive) {
      return null
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.revokeSession(sessionId, 'expired')
      return null
    }

    if (Date.now() - session.lastActivityAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
      session.lastActivityAt = new Date()
      await this.repository.update(sessionId, { lastActivityAt: session.lastActivityAt })
      await this.invalidateEntityCache(sessionId)
    }

    return session
  }

  /**
   * Revokes a live session in one conditional UPDATE, so a stale cached copy can never
   * be written back over newer columns.
   * @returns false when there was no live session with this id
   */
  async revokeSession(sessionId: string, reason = 'revoked'): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Session)
      .set({ isActive: false, deletedAt: new Date(), metadata: () => REVOCATION_METADATA_SQL })
      .setParameter('revocationReason', reason)
      .where('id = :sessionId', { sessionId })
      .andWhere('isActive = true')
      .andWhere('deletedAt IS NULL')
      .execute()

    const revoked = (result.affected ?? 0) > 0
    // Its row, and every list: counts, per-user lists and access statuses
    if (revoked) await this.invalidateEntityCache(sessionId)
    this.logger.debug(
      { sessionId, reason, revoked, action: 'session_revoked' },
      revoked ? 'Session revoked' : 'No live session to revoke'
    )
    return revoked
  }

  /**
   * Revokes every live session of the user, except `excludeSessionId` when given
   * @returns how many were revoked
   */
  /**
   * Revokes the user's live sessions. With `manager` it runs in the caller's transaction
   * and leaves the cache alone: the caller drops it once the transaction has committed
   * (invalidateAllCaches), so a rollback cannot leave the cache ahead of the database.
   */
  async revokeAllUserSessions(
    userId: string,
    excludeSessionId?: string,
    reason = 'user_logout_all',
    manager?: EntityManager
  ): Promise<number> {
    const query = (manager ? manager.getRepository(Session) : this.repository)
      .createQueryBuilder()
      .update(Session)
      .set({ isActive: false, deletedAt: new Date(), metadata: () => REVOCATION_METADATA_SQL })
      .setParameter('revocationReason', reason)
      .where('userId = :userId', { userId })
      .andWhere('isActive = true')
      .andWhere('deletedAt IS NULL')

    if (excludeSessionId) {
      query.andWhere('id != :excludeSessionId', { excludeSessionId })
    }

    const count = (await query.execute()).affected ?? 0
    this.logger.info(
      { userId, count, excludeSessionId, reason, action: 'revoke_all_user_sessions' },
      'Revoked all user sessions'
    )

    // A bulk update touches rows this repository did not read: drop every cached
    // session entry (rows by id, lists, access statuses), not just the lists
    if (!manager) await this.invalidateCacheByTag()
    return count
  }

  /**
   * Hard-deletes sessions that expired, or were revoked, more than `olderThanDays` ago
   * @returns how many were deleted
   */
  async cleanupExpired(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const result = await this.repository
      .createQueryBuilder('session')
      .delete()
      .where('expiresAt < :cutoffDate', { cutoffDate })
      .orWhere('(deletedAt IS NOT NULL AND deletedAt < :cutoffDate)', { cutoffDate })
      .execute()

    const count = result.affected ?? 0
    this.logger.info(
      { count, olderThanDays, cutoffDate, action: 'cleanup_expired_sessions' },
      'Cleaned up expired sessions'
    )

    await this.invalidateAllCaches()
    return count
  }

  async getActiveSessionCount(userId: string): Promise<number> {
    return this.cached(this.buildCacheKey('count', 'active', userId), () =>
      this.repository.count({
        where: { userId, isActive: true, deletedAt: IsNull(), expiresAt: MoreThan(new Date()) }
      })
    )
  }

  /** Counts of the user's sessions (all of them, not only live ones) */
  async getUserSessionStats(userId: string): Promise<{
    total: number
    active: number
    expired: number
    revoked: number
    byDevice: Record<string, number>
    bySecurityLevel: Record<string, number>
    bySessionType: Record<string, number>
    /** Live sessions that expire within 24 hours */
    expiringSoon: number
    /** Live sessions labelled high or critical, or of type 'suspicious' */
    suspicious: number
    /** Mean age of the live sessions, in hours */
    averageAgeHours: number
    oldestActive?: Date
    newestActive?: Date
  }> {
    return this.cached(
      this.buildCacheKey('stats', 'user', userId),
      async () => {
        const sessions = await this.repository.find({ where: { userId } })
        const now = Date.now()
        const isRevoked = (s: Session) => !s.isActive || !!s.deletedAt
        const active = sessions
          .filter(s => !isRevoked(s) && s.expiresAt.getTime() > now)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

        const tally = (key: (s: Session) => string | undefined) =>
          sessions.reduce<Record<string, number>>((counts, s) => {
            const value = key(s)
            if (value) counts[value] = (counts[value] ?? 0) + 1
            return counts
          }, {})

        return {
          total: sessions.length,
          active: active.length,
          expired: sessions.filter(s => !isRevoked(s) && s.expiresAt.getTime() <= now).length,
          revoked: sessions.filter(isRevoked).length,
          byDevice: tally(s => s.deviceType),
          bySecurityLevel: tally(s => s.securityLevel),
          bySessionType: tally(s => s.sessionType),
          expiringSoon: active.filter(s => s.expiresAt.getTime() - now <= 24 * 60 * 60 * 1000)
            .length,
          suspicious: active.filter(
            s =>
              s.securityLevel === 'high' ||
              s.securityLevel === 'critical' ||
              s.sessionType === 'suspicious'
          ).length,
          averageAgeHours: active.length
            ? Math.round(
                active.reduce((sum, s) => sum + (now - s.createdAt.getTime()), 0) /
                  active.length /
                  (60 * 60 * 1000)
              )
            : 0,
          oldestActive: active[0]?.createdAt,
          newestActive: active[active.length - 1]?.createdAt
        }
      },
      900
    )
  }

  /**
   * Heuristic risk of one session, for display: age, inactivity and its stored security
   * level. Nothing is enforced on it.
   */
  async assessSecurityRisk(sessionId: string): Promise<{
    riskLevel: string
    riskScore: number
    factors: string[]
    recommendations: string[]
  }> {
    // Fresh read: cached rows have string dates
    const session = await this.findById(sessionId, { bypassCache: true })
    if (!session) {
      throw new Error('Session not found')
    }

    const factors: string[] = []
    let riskScore = 0
    const hoursSince = (date: Date) => (Date.now() - date.getTime()) / (60 * 60 * 1000)

    if (hoursSince(session.createdAt) > 7 * 24) {
      factors.push('Session older than 7 days')
      riskScore += 20
    }
    if (hoursSince(session.lastActivityAt) > 24) {
      factors.push('No activity for 24+ hours')
      riskScore += 15
    }
    if (session.securityLevel === 'high') riskScore += 20
    else if (session.securityLevel === 'critical') riskScore += 40

    let riskLevel = 'low'
    if (riskScore >= 60) riskLevel = 'critical'
    else if (riskScore >= 40) riskLevel = 'high'
    else if (riskScore >= 20) riskLevel = 'medium'

    const recommendations =
      riskLevel === 'critical'
        ? ['Revoke session immediately', 'Require re-authentication']
        : riskLevel === 'high'
          ? ['Monitor closely', 'Consider requiring additional verification']
          : []

    return { riskLevel, riskScore, factors, recommendations }
  }

  /** Live sessions across all users, by device type and security level */
  async getDeviceStats(): Promise<{
    totalDevices: number
    byType: Record<string, number>
    bySecurityLevel: Record<string, number>
    activeDevices: number
  }> {
    return this.cached(
      this.buildCacheKey('stats', 'devices', 'all'),
      async () => {
        const live = () =>
          this.repository
            .createQueryBuilder('session')
            .where('session.isActive = true')
            .andWhere('session.deletedAt IS NULL')
            .andWhere('session.expiresAt > now()')
        const countBy = async (column: 'deviceType' | 'securityLevel') => {
          const rows = await live()
            .select(`session.${column}`, 'value')
            .addSelect('COUNT(*)', 'count')
            .andWhere(`session.${column} IS NOT NULL`)
            .groupBy(`session.${column}`)
            .getRawMany<{ value: string; count: string }>()
          return Object.fromEntries(rows.map(r => [r.value, Number(r.count)]))
        }

        const [totals, byType, bySecurityLevel] = await Promise.all([
          live()
            .select('COUNT(*)', 'sessions')
            .addSelect('COUNT(DISTINCT session.fingerprint)', 'devices')
            .getRawOne<{ sessions: string; devices: string }>(),
          countBy('deviceType'),
          countBy('securityLevel')
        ])

        return {
          totalDevices: Number(totals?.devices ?? 0),
          byType,
          bySecurityLevel,
          activeDevices: Number(totals?.sessions ?? 0)
        }
      },
      900
    )
  }

  /**
   * Whether an access token bound to this session may still be used.
   *
   * Called on every authenticated request. The sessions table is the source of truth;
   * the answer is cached for ACCESS_STATUS_TTL seconds and every revocation path above
   * clears it, so a revoked session stops working immediately. If Redis is unavailable
   * the lookup falls back to the database (never fails open).
   */
  async isUsableForAccess(sessionId: string, userId: string): Promise<boolean> {
    const status = await this.cached<AccessStatus>(
      this.buildCacheKey('access', userId, sessionId),
      async () => {
        const session = await this.repository.findOne({
          where: { id: sessionId },
          select: { id: true, userId: true, isActive: true, deletedAt: true, expiresAt: true }
        })
        return {
          active: !!session && session.userId === userId && session.isActive && !session.deletedAt,
          expiresAt: session?.expiresAt.getTime() ?? 0
        }
      },
      ACCESS_STATUS_TTL
    )
    return status.active && status.expiresAt > Date.now()
  }
}
