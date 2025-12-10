import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmailModule } from '@infrastructure/email/email.module'
import { LoggerModule } from 'nestjs-pino'

import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { AuthModule } from '@modules/auth/auth.module'
import { StoryVersion } from '@modules/stories/entities/story-version.entity'

import { CacheConfigModule } from '@core/cache/cache.module'
import configuration from '@core/config/configuration'
import { createLoggerConfig } from '@core/config/logger.config'
import { validate } from '@core/config/validation'
import { DatabaseModule } from '@core/database/database.module'
import { StoryVersionRepository } from '@core/database/repositories/story-version.repository'
import { ShutdownModule } from '@core/shutdown/shutdown.module'

import { QueueName } from './jobs/types'
import { AccountSecurityProcessor } from './processors/account-security.processor'
import { AttachmentProcessor } from './processors/attachment.processor'
import { EmailProcessor } from './processors/email.processor'
import { SessionCleanupProcessor } from './processors/session-cleanup.processor'
import { VersionCleanupProcessor } from './processors/version-cleanup.processor'
import { SessionCleanupScheduler } from './services/session-cleanup.scheduler'
import { VersionCleanupScheduler } from './services/version-cleanup.scheduler'
import { QueuesModule } from './queues.module'

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
    AuthModule,
    AttachmentsModule,
    EmailModule,
    TypeOrmModule.forFeature([StoryVersion]),
    CacheConfigModule,
    ShutdownModule
  ],
  providers: [
    SessionCleanupProcessor,
    SessionCleanupScheduler,
    VersionCleanupProcessor,
    VersionCleanupScheduler,
    AttachmentProcessor,
    AccountSecurityProcessor,
    EmailProcessor,
    StoryVersionRepository
  ]
})
export class QueueWorkerModule {}
