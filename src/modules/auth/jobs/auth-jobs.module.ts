import { Module } from '@nestjs/common'

import { QueuesModule } from '@core/queues/queues.module'

import { AuthModule } from '../auth.module'

import { AccountSecurityProcessor } from './account-security.processor'
import { AuthJobsScheduler } from './auth-jobs.scheduler'
import { SessionCleanupProcessor } from './session-cleanup.processor'

/**
 * Background jobs for the auth module. Imported only by the worker process:
 * processors start consuming as soon as they are instantiated.
 */
@Module({
  imports: [QueuesModule, AuthModule],
  providers: [SessionCleanupProcessor, AuthJobsScheduler, AccountSecurityProcessor]
})
export class AuthJobsModule {}
