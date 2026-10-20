import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { DatabaseModule } from '@app/database/database.module'
import { EmailModule } from '@infrastructure/email/email.module'
import { LoggerModule } from 'nestjs-pino'

import { AttachmentsJobsModule } from '@modules/attachments'
import { AuthJobsModule } from '@modules/auth'
import { PostTypesJobsModule } from '@modules/post-types'
import { StoriesJobsModule } from '@modules/stories'

import { CacheConfigModule } from '@core/cache/cache.module'
import configuration from '@core/config/configuration'
import { createLoggerConfig } from '@core/config/logger.config'
import { validate } from '@core/config/validation'
import { EventsModule } from '@core/events'
import { LoggingModule } from '@core/logging/logging.module'
import { OutboxRelayModule } from '@core/outbox'
import { QueueName } from '@core/queues/jobs/types'
import { EmailProcessor } from '@core/queues/processors/email.processor'
import { QueuesModule } from '@core/queues/queues.module'
import { SentryModule } from '@core/sentry'
import { ShutdownModule } from '@core/shutdown/shutdown.module'

/**
 * Root module of the worker process (src/worker.ts). Each feature module
 * contributes its processors and schedulers through its own jobs module.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => createLoggerConfig(configService)
    }),
    QueuesModule,
    // Explicitly register the email queue for this worker
    BullModule.registerQueue({
      name: QueueName.EMAIL
    }),
    DatabaseModule,
    EmailModule,
    CacheConfigModule,
    LoggingModule,
    SentryModule.forRoot(),
    OutboxRelayModule,
    EventsModule,
    ShutdownModule,
    AuthJobsModule,
    AttachmentsJobsModule,
    StoriesJobsModule,
    PostTypesJobsModule
  ],
  providers: [EmailProcessor]
})
export class QueueWorkerModule {}
