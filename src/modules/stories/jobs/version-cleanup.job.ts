import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, LessThan, IsNull } from 'typeorm'
import { PinoLogger } from 'nestjs-pino'
import { StoryVersionRepository } from '@core/database/repositories/story-version.repository'
import { StoryVersion, VersionStatus } from '../entities/story-version.entity'

/**
 * Version Cleanup Job
 *
 * Automated job that runs daily to clean up expired story versions.
 * Only deletes versions that:
 * - Have passed their expiresAt date
 * - Are not pinned (isPinned = false)
 * - Are not in ACTIVE or DRAFT status
 */
@Injectable()
export class VersionCleanupJob {
  constructor(
    @InjectRepository(StoryVersion)
    private readonly versionEntityRepository: Repository<StoryVersion>,
    private readonly versionRepository: StoryVersionRepository,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(VersionCleanupJob.name)
  }

  /**
   * Run cleanup daily at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'version-cleanup',
    timeZone: 'UTC'
  })
  async handleCleanup(): Promise<void> {
    this.logger.info('Starting version cleanup job')

    try {
      const now = new Date()

      // Find expired versions that can be deleted
      const expiredVersions = await this.versionEntityRepository.find({
        where: {
          expiresAt: LessThan(now),
          isPinned: false,
          status: VersionStatus.ARCHIVED
        },
        select: ['id', 'storyId', 'versionNumber', 'expiresAt']
      })

      if (expiredVersions.length === 0) {
        this.logger.info('No expired versions found to clean up')
        return
      }

      this.logger.info(
        { count: expiredVersions.length },
        `Found ${expiredVersions.length} expired versions to delete`
      )

      // Delete expired versions
      let deletedCount = 0
      let failedCount = 0

      for (const version of expiredVersions) {
        try {
          await this.versionEntityRepository.delete(version.id)
          deletedCount++

          this.logger.debug(
            {
              versionId: version.id,
              storyId: version.storyId,
              versionNumber: version.versionNumber,
              expiresAt: version.expiresAt
            },
            'Deleted expired version'
          )
        } catch (error) {
          failedCount++
          this.logger.error(
            {
              versionId: version.id,
              storyId: version.storyId,
              error: error instanceof Error ? error.message : 'Unknown error'
            },
            'Failed to delete expired version'
          )
        }
      }

      // Invalidate caches after cleanup
      if (deletedCount > 0) {
        try {
          await this.versionRepository.invalidateAllCaches()
          this.logger.debug('Invalidated version caches after cleanup')
        } catch (cacheError) {
          this.logger.warn(
            { error: cacheError instanceof Error ? cacheError.message : 'Unknown error' },
            'Failed to invalidate caches after cleanup'
          )
        }
      }

      this.logger.info(
        {
          total: expiredVersions.length,
          deleted: deletedCount,
          failed: failedCount
        },
        'Version cleanup job completed'
      )
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Version cleanup job failed'
      )
      throw error
    }
  }

  /**
   * Manual cleanup trigger (can be called via API if needed)
   */
  async runManualCleanup(dryRun = false): Promise<{
    total: number
    deleted: number
    failed: number
    versions: Array<{ id: string; storyId: number; versionNumber: number }>
  }> {
    this.logger.info({ dryRun }, 'Running manual version cleanup')

    const now = new Date()

    // Find expired versions
    const expiredVersions = await this.versionEntityRepository.find({
      where: {
        expiresAt: LessThan(now),
        isPinned: false,
        status: VersionStatus.ARCHIVED
      },
      select: ['id', 'storyId', 'versionNumber', 'expiresAt']
    })

    if (dryRun) {
      this.logger.info({ count: expiredVersions.length }, 'Dry run: Would delete these versions')
      return {
        total: expiredVersions.length,
        deleted: 0,
        failed: 0,
        versions: expiredVersions.map(v => ({
          id: v.id,
          storyId: v.storyId,
          versionNumber: v.versionNumber
        }))
      }
    }

    let deletedCount = 0
    let failedCount = 0
    const deletedVersions: Array<{ id: string; storyId: number; versionNumber: number }> = []

    for (const version of expiredVersions) {
      try {
        await this.versionEntityRepository.delete(version.id)
        deletedCount++
        deletedVersions.push({
          id: version.id,
          storyId: version.storyId,
          versionNumber: version.versionNumber
        })
      } catch (error) {
        failedCount++
        this.logger.error(
          {
            versionId: version.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          'Failed to delete version'
        )
      }
    }

    if (deletedCount > 0) {
      await this.versionRepository.invalidateAllCaches()
    }

    return {
      total: expiredVersions.length,
      deleted: deletedCount,
      failed: failedCount,
      versions: deletedVersions
    }
  }

  /**
   * Archive old versions (mark as ARCHIVED but don't delete)
   * Useful for versions older than X days that should be archived
   */
  async archiveOldVersions(olderThanDays = 90): Promise<{
    total: number
    archived: number
    failed: number
  }> {
    this.logger.info({ olderThanDays }, 'Archiving old versions')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    // Find old versions that are still ACTIVE
    const oldVersions = await this.versionEntityRepository.find({
      where: {
        createdAt: LessThan(cutoffDate),
        status: VersionStatus.ACTIVE,
        isPinned: false,
        expiresAt: IsNull() // Only archive versions without explicit expiry
      },
      select: ['id', 'storyId', 'versionNumber', 'createdAt']
    })

    if (oldVersions.length === 0) {
      this.logger.info('No old versions found to archive')
      return { total: 0, archived: 0, failed: 0 }
    }

    let archivedCount = 0
    let failedCount = 0

    for (const version of oldVersions) {
      try {
        await this.versionEntityRepository.update(version.id, {
          status: VersionStatus.ARCHIVED
        })
        archivedCount++

        this.logger.debug(
          {
            versionId: version.id,
            storyId: version.storyId,
            versionNumber: version.versionNumber
          },
          'Archived old version'
        )
      } catch (error) {
        failedCount++
        this.logger.error(
          {
            versionId: version.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          'Failed to archive version'
        )
      }
    }

    if (archivedCount > 0) {
      await this.versionRepository.invalidateAllCaches()
    }

    this.logger.info(
      {
        total: oldVersions.length,
        archived: archivedCount,
        failed: failedCount,
        olderThanDays
      },
      'Version archiving completed'
    )

    return {
      total: oldVersions.length,
      archived: archivedCount,
      failed: failedCount
    }
  }
}
