import { Module, DynamicModule, Global } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { SentryService } from './sentry.service'
import { SentryTestController } from './sentry-test.controller'

@Global()
@Module({})
export class SentryModule {
  static forRoot(): DynamicModule {
    return {
      module: SentryModule,
      imports: [ConfigModule],
      controllers: [SentryTestController], // Only in development for testing
      providers: [
        {
          provide: 'SENTRY_OPTIONS',
          useFactory: (configService: ConfigService) => {
            return {
              enabled: configService.get<boolean>('sentry.enabled', false),
              dsn: configService.get<string>('sentry.dsn', ''),
              environment: configService.get<string>('sentry.environment', 'development'),
              release: configService.get<string>('sentry.release', 'unknown'),
              tracesSampleRate: configService.get<number>('sentry.tracesSampleRate', 0),
              profilesSampleRate: configService.get<number>('sentry.profilesSampleRate', 0),
              debug: configService.get<boolean>('sentry.debug', false)
            }
          },
          inject: [ConfigService]
        },
        SentryService
      ],
      exports: [SentryService]
    }
  }
}
