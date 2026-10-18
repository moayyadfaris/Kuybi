import { Module } from '@nestjs/common'

import { QueuesModule } from '@core/queues/queues.module'

import { AuthModule } from '../auth.module'

import { AccountSecurityProcessor } from './account-security.processor'
import { SessionCleanupProcessor } from './session-cleanup.processor'
import { SessionCleanupScheduler } from './session-cleanup.scheduler'

/**
 * Background jobs for the auth module. Imported only by the worker process:
 * processors start consuming as soon as they are instantiated.
 */
@Module({
  imports: [QueuesModule, AuthModule],
  providers: [SessionCleanupProcessor, SessionCleanupScheduler, AccountSecurityProcessor]
})
export class AuthJobsModule {}
