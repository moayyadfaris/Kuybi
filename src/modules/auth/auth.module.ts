import { BullModule } from '@nestjs/bullmq'
import { forwardRef, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmailModule } from '@infrastructure/email'
import type { StringValue } from 'ms'

import { AuditModule } from '@modules/audit/audit.module'

import { CacheService } from '@core/cache/services/cache.service'
import { SessionRepository } from '@core/database/repositories/session.repository'
import { UserRepository } from '@core/database/repositories/user.repository'
import { MetricsModule } from '@core/observability/metrics.module'
import { QueueName } from '@core/queues/jobs/types'
import { SentryModule } from '@core/sentry'

import { EmailVerification } from '../users/entities/email-verification.entity'
import { User } from '../users/entities/user.entity'
import { UsersModule } from '../users/users.module'

import { AuthController } from './controllers/auth.controller'
import { CleanupStatsController } from './controllers/cleanup-stats.controller'
import { SessionsController } from './controllers/sessions.controller'
import { PasswordHistory } from './entities/password-history.entity'
import { PasswordReset } from './entities/password-reset.entity'
import { Session } from './entities/session.entity'
import { PasswordHistoryRepository } from './repositories/password-history.repository'
import { PasswordResetService } from './services/password-reset.service'
import { PasswordStrengthService } from './services/password-strength.service'
import { RegistrationService } from './services/registration.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import {
  AccountLockoutService,
  AuthService,
  SessionCleanupService,
  SessionsService,
  TokenBlacklistService
} from './services'

@Module({
  imports: [
    forwardRef(() => UsersModule),
    EmailModule,
    MetricsModule,
    SentryModule.forRoot(),
    AuditModule,
    TypeOrmModule.forFeature([Session, PasswordReset, PasswordHistory, User, EmailVerification]),
    BullModule.registerQueue({
      name: QueueName.ACCOUNT_SECURITY
    }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: configService.get<string>('auth.jwtAccessExpiresIn') as StringValue
        }
      })
    })
  ],
  controllers: [AuthController, SessionsController, CleanupStatsController],
  providers: [
    AuthService,
    SessionsService,
    SessionCleanupService,
    TokenBlacklistService,
    AccountLockoutService,
    RegistrationService,
    PasswordResetService,
    PasswordStrengthService,
    JwtStrategy,
    CacheService,
    SessionRepository,
    UserRepository,
    PasswordHistoryRepository
  ],
  exports: [
    AuthService,
    SessionsService,
    TokenBlacklistService,
    AccountLockoutService,
    RegistrationService,
    PasswordResetService,
    PasswordStrengthService,
    SessionRepository,
    PasswordHistoryRepository
  ]
})
export class AuthModule {}
