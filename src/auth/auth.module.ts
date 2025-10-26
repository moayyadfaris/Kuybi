import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { UsersModule } from '../users/users.module'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Session } from './entities/session.entity'
import { AuthController } from './auth.controller'
import { SessionsController } from './sessions.controller'
import { CleanupStatsController } from './cleanup-stats.controller'
import { AuthService, SessionsService, SessionCleanupService, TokenBlacklistService } from './services'
import { JwtStrategy } from './strategies/jwt.strategy'
import { CacheService } from '../cache/services/cache.service'
import { SessionRepository } from '../database/repositories/session.repository'

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([Session]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwtSecret'),
        signOptions: { expiresIn: configService.get<string>('auth.jwtAccessExpiresIn') }
      })
    })
  ],
  controllers: [AuthController, SessionsController, CleanupStatsController],
  providers: [
    AuthService,
    SessionsService,
    SessionCleanupService,
    TokenBlacklistService,
    JwtStrategy,
    CacheService,
    SessionRepository
  ],
  exports: [AuthService, SessionsService, TokenBlacklistService, SessionRepository]
})
export class AuthModule {}
