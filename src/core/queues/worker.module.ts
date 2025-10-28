import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import configuration from '@core/config/configuration'
import { validate } from '@core/config/validation'
import { LoggerModule } from 'nestjs-pino'
import { createLoggerConfig } from '@core/config/logger.config'
import { QueuesModule } from './queues.module'
import { AuthModule } from '@modules/auth/auth.module'
import { SessionCleanupProcessor } from './processors/session-cleanup.processor'
import { SessionCleanupScheduler } from './services/session-cleanup.scheduler'
import { DatabaseModule } from '@core/database/database.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => createLoggerConfig(configService),
    }),
    QueuesModule,
    DatabaseModule,
    AuthModule,
  ],
  providers: [SessionCleanupProcessor, SessionCleanupScheduler],
})
export class QueueWorkerModule {}
