import { Module } from '@nestjs/common'

import { ShutdownService } from './shutdown.service'

/**
 * Shutdown Module
 *
 * Graceful shutdown of the database and cache connections. BullMQ workers and queues
 * are closed by @nestjs/bullmq itself.
 */
@Module({
  providers: [ShutdownService],
  exports: [ShutdownService]
})
export class ShutdownModule {}
