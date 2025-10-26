import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { LoggerModule } from 'nestjs-pino'
import configuration from './config/configuration'
import { validate } from './config/validation'
import { createLoggerConfig } from './config/logger.config'
import { DatabaseModule } from './database/database.module'
import { CacheConfigModule } from './cache/cache.module'
import { HealthModule } from './health/health.module'
import { CountriesModule } from './countries/countries.module'
import { UsersModule } from './users/users.module'
import { AuthModule } from './auth/auth.module'
import { AttachmentsModule } from './attachments/attachments.module'
import { CategoriesModule } from './categories/categories.module'
import { StoriesModule } from './stories/stories.module'
import { TagsModule } from './tags/tags.module'
import { AclModule } from './acl/acl.module'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { LoggingModule } from './logging/logging.module'

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
