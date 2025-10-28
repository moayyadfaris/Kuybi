import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { LoggerModule } from 'nestjs-pino'
import configuration from '@core/config/configuration'
import { validate } from '@core/config/validation'
import { createLoggerConfig } from '@core/config/logger.config'
import { DatabaseModule } from '@core/database/database.module'
import { CacheConfigModule } from '@core/cache/cache.module'
import { HealthModule } from '@core/health/health.module'
import { CountriesModule } from '@modules/countries/countries.module'
import { UsersModule } from '@modules/users/users.module'
import { AuthModule } from '@modules/auth/auth.module'
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { CategoriesModule } from '@modules/categories/categories.module'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'
import { AclModule } from '@modules/acl/acl.module'
import { QueuesModule } from '@core/queues/queues.module'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { LoggingModule } from '@core/logging/logging.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate
    }),
    // Pino structured logging with request correlation
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => createLoggerConfig(configService),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const ttl = configService.get<number>('rateLimit.ttl', 60)
        const limit = configService.get<number>('rateLimit.limit', 20)
        return {
          throttlers: [
            {
              name: 'default',
              ttl,
              limit
            }
          ]
        }
      }
    }),
    DatabaseModule,
    CacheConfigModule,
    QueuesModule, // Bull queue infrastructure
    HealthModule,
    UsersModule,
    AuthModule,
    CountriesModule,
    CategoriesModule,
    AttachmentsModule,
    TagsModule,
    StoriesModule,
    AclModule,
    LoggingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
