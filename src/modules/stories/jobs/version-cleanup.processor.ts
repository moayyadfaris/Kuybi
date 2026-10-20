import { InjectQueue, Processor } from '@nestjs/bullmq'
import { errorMessage } from '@shared/utils/error.util'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { QueueName, VersionCleanupJobType } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { VersionStatus } from '../entities/story-version.entity'
import { StoryVersionRepository } from '../repositories/story-version.repository'

interface CleanupExpiredJobData {
  dryRun?: boolean
}

interface ArchiveOldJobData {
  olderThanDays?: number
}

/**
 * Story version retention, scheduled by VersionCleanupScheduler: deletes archived versions
 * whose expiresAt has passed, and archives active ones older than a cutoff. Pinned
 * versions are never touched.
 */
@Processor(QueueName.VERSION_CLEANUP)
export class VersionCleanupProcessor extends BaseProcessor {
  constructor(
    private readonly versionRepository: StoryVersionRepository,
    @InjectPinoLogger(VersionCleanupProcessor.name)
    logger: PinoLogger,
    @InjectQueue(QueueName.DEAD_LETTER)
    deadLetterQueue: Queue
  ) {
    super(logger, deadLetterQueue)
  }

  async process(job: Job<CleanupExpiredJobData | ArchiveOldJobData>): Promise<unknown> {
    switch (job.name) {
      case VersionCleanupJobType.CLEANUP_EXPIRED:
        return this.handleCleanupExpired(job as Job<CleanupExpiredJobData>)
      case VersionCleanupJobType.ARCHIVE_OLD:
        return this.handleArchiveOld(job as Job<ArchiveOldJobData>)
      default:
        this.logger.warn(
          { jobId: job.id, jobName: job.name },
          'Unknown version cleanup job received'
        )
        return { ignored: true }
    }
  }

  /** Deletes archived, unpinned versions past their expiresAt (dryRun: only lists them) */
  private async handleCleanupExpired(job: Job<CleanupExpiredJobData>) {
    const dryRun = job.data?.dryRun ?? false
    this.logger.info({ jobId: job.id, dryRun }, 'Running version cleanup job')

    try {
      const now = new Date()

      const expiredVersions = await this.versionRepository.findExpiredArchived(now)

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

      let deletedCount = 0
      let failedCount = 0

      for (const version of expiredVersions) {
        try {
          await this.versionRepository.delete(version.id)
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
              error: errorMessage(error)
            },
            'Failed to delete expired version'
          )
        }
      }

      if (deletedCount > 0) {
        try {
          await this.versionRepository.invalidateAllCaches()
          this.logger.debug('Invalidated version caches after cleanup')
        } catch (cacheError) {
          this.logger.warn(
            { error: errorMessage(cacheError) },
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
      this.logger.error({ error: errorMessage(error) }, 'Version cleanup job failed')
      throw error
    }
  }

  /** Archives active, unpinned versions without an expiry that are older than the cutoff */
  private async handleArchiveOld(job: Job<ArchiveOldJobData>) {
    const olderThanDays = job.data?.olderThanDays ?? 90
    this.logger.info({ jobId: job.id, olderThanDays }, 'Archiving old versions')

    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

      const oldVersions = await this.versionRepository.findActiveCreatedBefore(cutoffDate)

      if (oldVersions.length === 0) {
        this.logger.info('No old versions found to archive')
        return { total: 0, archived: 0, failed: 0 }
      }

      let archivedCount = 0
      let failedCount = 0

      for (const version of oldVersions) {
        try {
          await this.versionRepository.update(version.id, {
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
              error: errorMessage(error)
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
      this.logger.error({ error: errorMessage(error) }, 'Version archiving job failed')
      throw error
    }
  }
}
