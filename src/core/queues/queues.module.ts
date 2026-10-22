import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { queueConfig, queueConnectionOptions } from './config/queue.config'
import { QueueName } from './jobs/types'
import { QueueMetrics } from './queue-metrics'

/**
 * Queues Module
 *
 * Provides BullMQ infrastructure (connection + queue registration).
 * Imported by both the API app (producers) and worker app (processors).
 */
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        // The app's Redis settings (configuration.ts), on the queue database
        connection: {
          host: configService.getOrThrow<string>('redis.host'),
          port: configService.getOrThrow<number>('redis.port'),
          password: configService.get<string>('redis.password'),
          db: configService.getOrThrow<number>('redis.queueDb'),
          ...queueConnectionOptions
        },
        defaultJobOptions: queueConfig.defaultJobOptions
      }),
      inject: [ConfigService]
    }),
    BullModule.registerQueue(
      { name: QueueName.SESSION_CLEANUP, ...queueConfig.queues[QueueName.SESSION_CLEANUP] },
      { name: QueueName.EMAIL, ...queueConfig.queues[QueueName.EMAIL] },
      {
        name: QueueName.ATTACHMENT_PROCESSING,
        ...queueConfig.queues[QueueName.ATTACHMENT_PROCESSING]
      },
      { name: QueueName.VERSION_CLEANUP, ...queueConfig.queues[QueueName.VERSION_CLEANUP] },
      {
        name: QueueName.CONTENT_PUBLISHING,
        ...queueConfig.queues[QueueName.CONTENT_PUBLISHING]
      },
      { name: QueueName.AUDIT_RETENTION, ...queueConfig.queues[QueueName.AUDIT_RETENTION] },
      { name: QueueName.ACCOUNT_SECURITY, ...queueConfig.queues[QueueName.ACCOUNT_SECURITY] },
      { name: QueueName.DEAD_LETTER, ...queueConfig.queues[QueueName.DEAD_LETTER] }
    )
  ],
  providers: [QueueMetrics],
  exports: [BullModule]
})
export class QueuesModule {}
