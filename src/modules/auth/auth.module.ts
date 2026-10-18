import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmailModule } from '@infrastructure/email'
import type { StringValue } from 'ms'

import { Role } from '@modules/acl/entities'
import { AuditModule } from '@modules/audit'
import { UsersModule } from '@modules/users'
import { EmailVerification, User } from '@modules/users/entities'

import { MetricsModule } from '@core/observability/metrics.module'
import { QueueName } from '@core/queues/jobs/types'

import { AuthController } from './controllers/auth.controller'
import { CleanupStatsController } from './controllers/cleanup-stats.controller'
import { SessionsController } from './controllers/sessions.controller'
import { PasswordHistory } from './entities/password-history.entity'
import { PasswordReset } from './entities/password-reset.entity'
import { Session } from './entities/session.entity'
import { UserCredentialsResetListener } from './listeners/user-credentials-reset.listener'
import { PasswordHistoryRepository } from './repositories/password-history.repository'
import { SessionRepository } from './repositories/session.repository'
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
    UsersModule,
    EmailModule,
    MetricsModule,
    AuditModule,
    TypeOrmModule.forFeature([
      Session,
      PasswordReset,
      PasswordHistory,
      User,
      EmailVerification,
      Role
    ]),
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
    UserCredentialsResetListener,
    SessionRepository,
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
