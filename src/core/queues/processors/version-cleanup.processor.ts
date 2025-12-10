import { InjectQueue, Processor } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { IsNull, LessThan, Repository } from 'typeorm'

import { StoryVersion, VersionStatus } from '@modules/stories/entities/story-version.entity'

import { StoryVersionRepository } from '@core/database/repositories/story-version.repository'

import { QueueName, VersionCleanupJobType } from '../jobs/types'

import { BaseProcessor } from './base.processor'

interface CleanupExpiredJobData {
  dryRun?: boolean
}

interface ArchiveOldJobData {
  olderThanDays?: number
}

interface ManualCleanupJobData {
  dryRun?: boolean
}

@Processor(QueueName.VERSION_CLEANUP)
export class VersionCleanupProcessor extends BaseProcessor {
  constructor(
    @InjectRepository(StoryVersion)
    private readonly versionEntityRepository: Repository<StoryVersion>,
    private readonly versionRepository: StoryVersionRepository,
    @InjectPinoLogger(VersionCleanupProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.VERSION_CLEANUP)
    private readonly versionQueue: Queue,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
  }

  /**
   * Central dispatch for BullMQ jobs
   */
  async process(
    job: Job<CleanupExpiredJobData | ArchiveOldJobData | ManualCleanupJobData>
  ): Promise<unknown> {
    switch (job.name) {
      case VersionCleanupJobType.CLEANUP_EXPIRED:
        return this.handleCleanupExpired(job as Job<CleanupExpiredJobData>)
      case VersionCleanupJobType.ARCHIVE_OLD:
        return this.handleArchiveOld(job as Job<ArchiveOldJobData>)
      case VersionCleanupJobType.MANUAL_CLEANUP:
        return this.handleManualCleanup(job as Job<ManualCleanupJobData>)
      default:
        this.logger.warn(
          { jobId: job.id, jobName: job.name },
          'Unknown version cleanup job received'
        )
        return { ignored: true }
    }
  }

  /**
   * Handle cleanup of expired versions
   */
  private async handleCleanupExpired(job: Job<CleanupExpiredJobData>) {
    const dryRun = job.data?.dryRun ?? false
    this.logger.info({ jobId: job.id, dryRun }, 'Running version cleanup job')

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
        return { total: 0, deleted: 0, failed: 0 }
      }

      this.logger.info(
        { count: expiredVersions.length },
        `Found ${expiredVersions.length} expired versions to delete`
      )

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

      const result = {
        total: expiredVersions.length,
        deleted: deletedCount,
        failed: failedCount
      }

      this.logger.info(result, 'Version cleanup job completed')
      return result
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Version cleanup job failed'
      )
      throw error
    }
  }

  /**
   * Handle archiving of old versions
   */
  private async handleArchiveOld(job: Job<ArchiveOldJobData>) {
    const olderThanDays = job.data?.olderThanDays ?? 90
    this.logger.info({ jobId: job.id, olderThanDays }, 'Archiving old versions')

    try {
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

      const result = {
        total: oldVersions.length,
        archived: archivedCount,
        failed: failedCount,
        olderThanDays
      }

      this.logger.info(result, 'Version archiving completed')
      return result
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Version archiving job failed'
      )
      throw error
    }
  }

  /**
   * Handle manual cleanup trigger
   */
  private async handleManualCleanup(job: Job<ManualCleanupJobData>) {
    const dryRun = job.data?.dryRun ?? false
    this.logger.info({ jobId: job.id, dryRun }, 'Running manual version cleanup')

    // Manual cleanup is the same as regular cleanup, just triggered differently
    return this.handleCleanupExpired(job as Job<CleanupExpiredJobData>)
  }

  /**
   * Utility to enqueue cleanup jobs (used by API for manual triggers)
   */
  async enqueueCleanup(dryRun = false) {
    await this.versionQueue.add(VersionCleanupJobType.CLEANUP_EXPIRED, { dryRun })
  }

  /**
   * Utility to enqueue archive jobs
   */
  async enqueueArchive(olderThanDays = 90) {
    await this.versionQueue.add(VersionCleanupJobType.ARCHIVE_OLD, { olderThanDays })
  }
}
