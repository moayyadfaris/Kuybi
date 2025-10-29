import { Injectable } from '@nestjs/common'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { SessionsService } from './sessions.service'
import { SessionRepository } from '@core/database/repositories/session.repository'

/**
 * Session Cleanup Service - Supports manual cleanup entrypoints.
 *
 * Queue workers now handle the automated schedule; the API only exposes
 * manual triggers and reporting helpers for administrators.
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
    this.logger.info(
      { olderThanDays, action: 'manual_cleanup_start', jobType: 'manual' },
      'Manual cleanup triggered'
    )

    const result = await this.sessionsService.cleanupExpiredSessions(olderThanDays)
    const duration = Date.now() - startTime

    this.totalCleaned += result.deleted

    this.logger.info(
      {
        deleted: result.deleted,
        duration,
        totalCleaned: this.totalCleaned,
        action: 'manual_cleanup_complete',
        jobType: 'manual'
      },
      'Manual cleanup completed'
    )

    this.lastCleanupTime = new Date()
    await this.logCleanupStats(result.deleted)

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
      isHealthy: this.lastCleanupTime
        ? Date.now() - this.lastCleanupTime.getTime() < 3600000 * 2
        : true // Within 2 hours
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
        {
          activeDevices: deviceStats.activeDevices,
          deviceBreakdown: deviceStats.byType,
          action: 'cleanup_stats'
        },
        'Current session statistics'
      )
    }
  }
}
