import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'

import { QueueName } from '@core/queues/jobs/types'

import { ShutdownService } from './shutdown.service'

/**
 * Shutdown Module
 *
 * Provides graceful shutdown handling for the application
 * Ensures all connections and queues are properly closed
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QueueName.EMAIL },
      { name: QueueName.SESSION_CLEANUP },
      { name: QueueName.LOG_MAINTENANCE },
      { name: QueueName.ATTACHMENT_PROCESSING },
      { name: QueueName.ACCOUNT_SECURITY },
      { name: QueueName.DEAD_LETTER }
    )
  ],
  providers: [ShutdownService],
  exports: [ShutdownService]
})
export class ShutdownModule {}
