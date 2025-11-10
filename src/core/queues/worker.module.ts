import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'
import configuration from '@core/config/configuration'
import { validate } from '@core/config/validation'
import { LoggerModule } from 'nestjs-pino'
import { createLoggerConfig } from '@core/config/logger.config'
import { QueuesModule } from './queues.module'
import { AuthModule } from '@modules/auth/auth.module'
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { EmailModule } from '@infrastructure/email/email.module'
import { SessionCleanupProcessor } from './processors/session-cleanup.processor'
import { SessionCleanupScheduler } from './services/session-cleanup.scheduler'
import { VersionCleanupProcessor } from './processors/version-cleanup.processor'
import { VersionCleanupScheduler } from './services/version-cleanup.scheduler'
import { AttachmentProcessor } from './processors/attachment.processor'
import { AccountSecurityProcessor } from './processors/account-security.processor'
import { EmailProcessor } from './processors/email.processor'
import { DatabaseModule } from '@core/database/database.module'
import { StoryVersion } from '@modules/stories/entities/story-version.entity'
import { StoryVersionRepository } from '@core/database/repositories/story-version.repository'
import { CacheConfigModule } from '@core/cache/cache.module'
import { QueueName } from './jobs/types'

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
    CacheConfigModule
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
