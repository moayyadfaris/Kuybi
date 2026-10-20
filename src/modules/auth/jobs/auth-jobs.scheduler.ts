import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'

import { AccountSecurityJobType, QueueName, SessionCleanupJobType } from '@core/queues/jobs/types'

/**
 * Registers the auth module's recurring jobs (worker process only). BullMQ job schedulers
 * are upserted by id, so every worker can run this at start-up: the schedule exists once,
 * and a changed pattern or payload takes effect.
 */
@Injectable()
export class AuthJobsScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QueueName.SESSION_CLEANUP)
    private readonly sessionQueue: Queue,
    @InjectQueue(QueueName.ACCOUNT_SECURITY)
    private readonly accountSecurityQueue: Queue
  ) {}

  async onModuleInit() {
    // Hard-delete sessions that ended long ago
    await this.sessionQueue.upsertJobScheduler(
      'session-cleanup-hourly',
      { pattern: '0 * * * *' },
      { name: SessionCleanupJobType.CLEANUP_EXPIRED, data: {} }
    )
    // Removes the scheduler of the dropped expiring-sessions check from existing deployments
    await this.sessionQueue.removeJobScheduler('session-expiring-check')
    await this.sessionQueue.upsertJobScheduler(
      'password-reset-cleanup-daily',
      { pattern: '30 3 * * *' },
      { name: SessionCleanupJobType.CLEANUP_RESET_TOKENS, data: {} }
    )
    // Backstop for a missed per-lock unlock job: unlock every account whose lock ended
    await this.accountSecurityQueue.upsertJobScheduler(
      'expired-locks-sweep',
      { pattern: '*/15 * * * *' },
      { name: AccountSecurityJobType.CHECK_EXPIRED_LOCKS, data: {} }
    )
  }
}
