import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { SessionsService } from './sessions.service'
import { SessionRepository } from '../../database/repositories/session.repository'

/**
 * Session Cleanup Service - Automated Session Lifecycle Management
 * 
 * Responsibilities:
 * - Cleanup expired sessions (runs every hour)
 * - Monitor session health metrics
 * - Emit cleanup events for monitoring
 * - Log cleanup statistics
 * 
 * Schedule:
 * - Runs every hour at :00 minutes
 * - Deletes sessions expired for 30+ days
 * - Logs results for audit trail
 */
@Injectable()
export class SessionCleanupService {
  private lastCleanupTime?: Date
  private totalCleaned = 0

  constructor(
    @InjectPinoLogger(SessionCleanupService.name)
    private readonly logger: PinoLogger,
    private readonly sessionsService: SessionsService,
    private readonly sessionRepository: SessionRepository
  ) {}

  /**
   * Automated cleanup job - runs every hour
   * Deletes sessions that have been expired for 30+ days
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleSessionCleanup() {
    const startTime = Date.now()
    this.logger.info({ action: 'scheduled_cleanup_start', jobType: 'cron' }, 'Starting scheduled session cleanup')

    try {
      // Cleanup sessions older than 30 days
      const result = await this.sessionsService.cleanupExpiredSessions(30)

      const duration = Date.now() - startTime
      this.lastCleanupTime = new Date()
      this.totalCleaned += result.deleted

      this.logger.info(
        { deleted: result.deleted, duration, totalCleaned: this.totalCleaned, action: 'scheduled_cleanup_complete', jobType: 'cron' },
        'Session cleanup completed'
      )

      // Log statistics
      await this.logCleanupStats(result.deleted)

      return result
    } catch (error) {
      this.logger.error(`❌ Session cleanup failed: ${error.message}`, error.stack)
      throw error
    }
  }

  /**
   * Manual cleanup trigger (can be called via API)
   * @param olderThanDays - Delete sessions older than X days
   * @returns Promise<object>
   */
  async manualCleanup(olderThanDays = 30): Promise<{
    deleted: number
    duration: number
    timestamp: string
  }> {
    const startTime = Date.now()
    this.logger.info({ olderThanDays, action: 'manual_cleanup_start', jobType: 'manual' }, 'Manual cleanup triggered')

    const result = await this.sessionsService.cleanupExpiredSessions(olderThanDays)
    const duration = Date.now() - startTime

    this.totalCleaned += result.deleted

    this.logger.info(
      { deleted: result.deleted, duration, totalCleaned: this.totalCleaned, action: 'manual_cleanup_complete', jobType: 'manual' },
      'Manual cleanup completed'
    )

    return {
      deleted: result.deleted,
      duration,
      timestamp: result.timestamp
    }
  }

  /**
   * Get cleanup service statistics
   * @returns object
   */
  getCleanupStats() {
    return {
      lastCleanupTime: this.lastCleanupTime,
      totalCleaned: this.totalCleaned,
      isHealthy: this.lastCleanupTime ? Date.now() - this.lastCleanupTime.getTime() < 3600000 * 2 : true // Within 2 hours
    }
  }

  /**
   * Check for sessions expiring soon and log warnings
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkExpiringSessions() {
    try {
      const expiringSoon = await this.sessionRepository.findExpiringSoon(60) // Within 1 hour

      if (expiringSoon.length > 0) {
        this.logger.warn(
          { count: expiringSoon.length, withinMinutes: 60, action: 'expiring_sessions_check' },
          'Sessions expiring soon'
        )
      }

      // Check for high-risk sessions
      const suspicious = await this.sessionRepository.findSuspiciousSessions()
      if (suspicious.length > 0) {
        this.logger.warn(
          { count: suspicious.length, action: 'suspicious_sessions_detected' },
          'Suspicious sessions detected'
        )
      }
    } catch (error) {
      this.logger.error(
        { error: error.message, action: 'check_expiring_sessions_failed' },
        'Failed to check expiring sessions'
      )
    }
  }

  /**
   * Log detailed cleanup statistics
   * @private
   */
  private async logCleanupStats(deletedCount: number) {
    if (deletedCount > 0) {
      // Get device stats to understand what was cleaned
      const deviceStats = await this.sessionRepository.getDeviceStats()
      this.logger.debug(
        { activeDevices: deviceStats.activeDevices, deviceBreakdown: deviceStats.byType, action: 'cleanup_stats' },
        'Current session statistics'
      )
    }
  }
}
