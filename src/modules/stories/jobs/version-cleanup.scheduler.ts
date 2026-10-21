import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'

import { QueueName, VersionCleanupJobType } from '@core/queues/jobs/types'

/** Schedulers of earlier releases, removed so their jobs stop firing */
const RETIRED_SCHEDULERS = ['version-archive-weekly']

/**
 * Daily version prune at 02:00 UTC. upsertJobScheduler is idempotent and applies a
 * changed pattern or payload (STORY_KEEP_AUTO_VERSIONS) on the next start.
 */
@Injectable()
export class VersionCleanupScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.VERSION_CLEANUP)
    private readonly versionQueue: Queue,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    for (const id of RETIRED_SCHEDULERS) await this.versionQueue.removeJobScheduler(id)

    await this.versionQueue.upsertJobScheduler(
      'version-cleanup-daily',
      { pattern: '0 2 * * *', tz: 'UTC' },
      {
        name: VersionCleanupJobType.PRUNE_AUTO,
        data: {
          keepAutoVersions: this.configService.get<number>('stories.keepAutoVersions', 50)
        }
      }
    )
  }
}
