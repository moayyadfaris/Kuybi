import { InjectQueue, Processor } from '@nestjs/bullmq'
import { Job, Queue } from 'bullmq'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { QueueName, VersionCleanupJobType } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { StoryVersionRepository } from '../repositories/story-version.repository'

interface PruneAutoJobData {
  keepAutoVersions: number
}

/** Versions deleted per transaction; a run repeats until nothing is left to prune */
const PRUNE_BATCH = 1000

/**
 * Story version retention, scheduled daily by VersionCleanupScheduler: keeps the newest
 * automatic versions per story and branch and every version something depends on
 * (StoryVersionRepository.pruneAutoVersions).
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

  async process(job: Job<PruneAutoJobData>): Promise<unknown> {
    if (job.name !== VersionCleanupJobType.PRUNE_AUTO) {
      // Jobs of removed schedulers may still be queued from before a deploy
      this.logger.warn({ jobId: job.id, jobName: job.name }, 'Unknown version cleanup job')
      return { ignored: true }
    }

    const keep = job.data.keepAutoVersions
    let deleted = 0
    for (;;) {
      const count = await this.versionRepository.pruneAutoVersions(keep, PRUNE_BATCH)
      deleted += count
      if (count < PRUNE_BATCH) break
    }
    this.logger.info({ jobId: job.id, keep, deleted }, 'Pruned automatic story versions')
    return { deleted }
  }
}
