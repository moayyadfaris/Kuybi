import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { QueueName } from './jobs/types'
import { queueConfig } from './config/queue.config'

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
        connection: {
          host: configService.get('redis.host', queueConfig.connection.host),
          port: configService.get('redis.port', queueConfig.connection.port),
          password: configService.get('redis.password', queueConfig.connection.password),
          db: configService.get('redis.queueDb', queueConfig.connection.db),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
        defaultJobOptions: queueConfig.defaultJobOptions,
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QueueName.SESSION_CLEANUP, ...queueConfig.queues[QueueName.SESSION_CLEANUP] },
      { name: QueueName.LOG_MAINTENANCE, ...queueConfig.queues[QueueName.LOG_MAINTENANCE] },
      { name: QueueName.EMAIL, ...queueConfig.queues[QueueName.EMAIL] },
      { name: QueueName.SMS, ...queueConfig.queues[QueueName.SMS] },
      { name: QueueName.ATTACHMENT_PROCESSING, ...queueConfig.queues[QueueName.ATTACHMENT_PROCESSING] },
      { name: QueueName.NOTIFICATION, ...queueConfig.queues[QueueName.NOTIFICATION] },
      { name: QueueName.SECURITY_SCAN, ...queueConfig.queues[QueueName.SECURITY_SCAN] },
      { name: QueueName.DATA_EXPORT, ...queueConfig.queues[QueueName.DATA_EXPORT] },
      { name: QueueName.REPORT_GENERATION, ...queueConfig.queues[QueueName.REPORT_GENERATION] },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
