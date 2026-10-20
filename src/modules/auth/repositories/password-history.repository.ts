import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { PasswordHistory } from '../entities/password-history.entity'

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
   * Get password history for a user (most recent first).
   *
   * Always read from the database: the reuse and cooldown policies decide on this data,
   * and the rows contain password hashes, which must not be copied into the cache.
   */
  async findByUser(userId: string, limit: number = 5): Promise<PasswordHistory[]> {
    return this.repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit
    })
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
}
