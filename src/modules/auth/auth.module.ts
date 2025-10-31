import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { UsersModule } from '../users/users.module'
import { EmailModule } from '@infrastructure/email'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { StringValue } from 'ms'
import { Session } from './entities/session.entity'
import { PasswordReset } from './entities/password-reset.entity'
import { User } from '../users/entities/user.entity'
import { EmailVerification } from '../users/entities/email-verification.entity'
import { AuthController } from './controllers/auth.controller'
import { SessionsController } from './controllers/sessions.controller'
import { CleanupStatsController } from './controllers/cleanup-stats.controller'
import {
  AuthService,
  SessionsService,
  SessionCleanupService,
  TokenBlacklistService
} from './services'
import { RegistrationService } from './services/registration.service'
import { PasswordResetService } from './services/password-reset.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { CacheService } from '@core/cache/services/cache.service'
import { SessionRepository } from '@core/database/repositories/session.repository'
import { SentryModule } from '@core/sentry'
import { AuditModule } from '@modules/audit/audit.module'

@Module({
  imports: [
    forwardRef(() => UsersModule),
    EmailModule,
    SentryModule.forRoot(),
    AuditModule,
    TypeOrmModule.forFeature([Session, PasswordReset, User, EmailVerification]),
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
    RegistrationService,
    PasswordResetService,
    JwtStrategy,
    CacheService,
    SessionRepository
  ],
  exports: [
    AuthService,
    SessionsService,
    TokenBlacklistService,
    RegistrationService,
    PasswordResetService,
    SessionRepository
  ]
})
export class AuthModule {}
