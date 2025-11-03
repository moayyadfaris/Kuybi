import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import configuration from '@core/config/configuration'
import { validate } from '@core/config/validation'
import { LoggerModule } from 'nestjs-pino'
import { createLoggerConfig } from '@core/config/logger.config'
import { QueuesModule } from './queues.module'
import { AuthModule } from '@modules/auth/auth.module'
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { SessionCleanupProcessor } from './processors/session-cleanup.processor'
import { SessionCleanupScheduler } from './services/session-cleanup.scheduler'
import { VersionCleanupProcessor } from './processors/version-cleanup.processor'
import { VersionCleanupScheduler } from './services/version-cleanup.scheduler'
import { AttachmentProcessor } from './processors/attachment.processor'
import { DatabaseModule } from '@core/database/database.module'
import { StoryVersion } from '@modules/stories/entities/story-version.entity'
import { StoryVersionRepository } from '@core/database/repositories/story-version.repository'
import { CacheConfigModule } from '@core/cache/cache.module'

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
    DatabaseModule,
    AuthModule,
    AttachmentsModule,
    TypeOrmModule.forFeature([StoryVersion]),
    CacheConfigModule
  ],
  providers: [
    SessionCleanupProcessor,
    SessionCleanupScheduler,
    VersionCleanupProcessor,
    VersionCleanupScheduler,
    AttachmentProcessor,
    StoryVersionRepository
  ]
})
export class QueueWorkerModule {}
