import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from '@core/database/repositories/base.repository'
import { PasswordHistory } from '../entities/password-history.entity'
import { CacheService } from '@core/cache/services/cache.service'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

@Injectable()
export class PasswordHistoryRepository extends BaseRepository<PasswordHistory> {
  protected entityName = 'password_history'

  constructor(
    @InjectRepository(PasswordHistory)
    repository: Repository<PasswordHistory>,
    cacheService: CacheService,
    @InjectPinoLogger(PasswordHistoryRepository.name)
    private readonly logger: PinoLogger
  ) {
    super(repository, cacheService)
  }

  /**
   * Get password history for a user (most recent first)
   */
  async findByUser(userId: string, limit: number = 5): Promise<PasswordHistory[]> {
    const cacheKey = `${this.entityName}:user:${userId}:limit:${limit}`

    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { userId },
          order: { createdAt: 'DESC' },
          take: limit
        })
      },
      3600 // Cache for 1 hour
    )
  }

  /**
   * Add new password to history and cleanup old entries
   * Keeps only the last N entries per user
   */
  async addPasswordHistory(
    userId: string,
    passwordHash: string,
    ipAddress?: string,
    userAgent?: string,
    keepLast: number = 5
  ): Promise<PasswordHistory> {
    // Create new entry
    const entry = this.repository.create({
      userId,
      passwordHash,
      ipAddress,
      userAgent
    })

    const saved = await this.repository.save(entry)

    // Cleanup old entries (keep only last N)
    await this.cleanupOldPasswords(userId, keepLast)

    // Invalidate cache
    await this.invalidateUserCache(userId)

    this.logger.info(
      { userId, keepLast, ipAddress },
      'Password history entry added and old entries cleaned'
    )

    return saved
  }

  /**
   * Clean up old password entries, keeping only the most recent N
   */
  private async cleanupOldPasswords(userId: string, keepLast: number): Promise<void> {
    // Get all entries for user, ordered by date
    const allEntries = await this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' }
    })

    // If we have more than keepLast, delete the older ones
    if (allEntries.length > keepLast) {
      const entriesToDelete = allEntries.slice(keepLast)
      const idsToDelete = entriesToDelete.map(e => e.id)

      await this.repository.delete(idsToDelete)

      this.logger.debug(
        { userId, deleted: idsToDelete.length, kept: keepLast },
        'Cleaned up old password history entries'
      )
    }
  }

  /**
   * Invalidate all cache for a specific user
   */
  private async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [`${this.entityName}:user:${userId}:*`, `${this.entityName}:list:*`]

    for (const pattern of patterns) {
      await this.cacheService.del(pattern)
    }
  }

  /**
   * Check if a password hash exists in user's history
   */
  async isPasswordInHistory(userId: string, passwordHash: string): Promise<boolean> {
    const history = await this.findByUser(userId, 5)
    return history.some(entry => entry.passwordHash === passwordHash)
  }

  /**
   * Get count of password changes for a user
   */
  async getPasswordChangeCount(userId: string): Promise<number> {
    return this.repository.count({ where: { userId } })
  }

  /**
   * Get password history within a date range
   */
  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate?: Date
  ): Promise<PasswordHistory[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('ph')
      .where('ph.userId = :userId', { userId })
      .andWhere('ph.createdAt >= :startDate', { startDate })

    if (endDate) {
      queryBuilder.andWhere('ph.createdAt <= :endDate', { endDate })
    }

    return queryBuilder.orderBy('ph.createdAt', 'DESC').getMany()
  }

  /**
   * Delete all password history for a user
   */
  async deleteUserHistory(userId: string): Promise<void> {
    await this.repository.delete({ userId })
    await this.invalidateUserCache(userId)

    this.logger.info({ userId }, 'Deleted all password history for user')
  }
}
