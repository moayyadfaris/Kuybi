import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ErrorCode } from '@shared/errors'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { UserRepository } from '@modules/users'

import { PASSWORD_CHANGE_TOKEN_SCOPE } from '@core/auth'

import { SessionRepository } from '../repositories/session.repository'
import { TokenBlacklistService } from '../services/token-blacklist.service'
import type { AccessTokenPayload } from '../types/jwt-payload'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectPinoLogger(JwtStrategy.name)
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.jwtSecret'),
      passReqToCallback: true // Enable access to the request object
    })
  }

  async validate(req: Request, payload: AccessTokenPayload) {
    // Extract the raw JWT token from the request
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    if (!token) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_TOKEN_MISSING,
        message: 'Access token not found'
      })
    }

    // Check if token is blacklisted (user logged out)
    const isBlacklisted = await this.tokenBlacklistService.isTokenBlacklisted(token)
    if (isBlacklisted) {
      this.logger.warn(
        {
          userId: payload.sub,
          email: payload.email,
          action: 'blacklisted_token_attempt'
        },
        'Attempted use of blacklisted token'
      )
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_SESSION_ENDED,
        message: 'Token has been revoked'
      })
    }

    // The token dies with its session (logout, logout-all, admin password reset, refresh).
    // Only the temporary password-change token has no session; JwtAuthGuard limits its scope.
    if (payload.sid) {
      const usable = await this.sessionRepository.isUsableForAccess(payload.sid, payload.sub)
      if (!usable) {
        this.logger.warn(
          { userId: payload.sub, sessionId: payload.sid, action: 'revoked_session_token_attempt' },
          'Access token used after its session ended'
        )
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_SESSION_ENDED,
          message: 'Session has ended'
        })
      }
      req.sessionId = payload.sid
    } else if (!payload.tempPasswordChange) {
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_TOKEN_INVALID,
        message: 'Access token is not bound to a session'
      })
    }

    // Load full user entity (includes primaryRole, userRoles relations)
    // Repository automatically includes: profileImage, primaryRole, userRoles, userRoles.role
    // IMPORTANT: Bypass cache to ensure User entity methods are available
    const user = await this.userRepository.findById(payload.sub, { bypassCache: true })

    if (!user) {
      this.logger.warn(
        {
          userId: payload.sub,
          email: payload.email,
          action: 'user_not_found_in_jwt_validation'
        },
        'User from JWT payload not found in database'
      )
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_TOKEN_INVALID,
        message: 'User not found'
      })
    }

    if (!user.isActive) {
      this.logger.warn(
        {
          userId: user.id,
          email: user.email,
          action: 'inactive_user_token_attempt'
        },
        'Inactive user attempted to use token'
      )
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_ACCOUNT_INACTIVE,
        message: 'User account is inactive'
      })
    }

    // Temp tokens issued for forced password change are restricted by JwtAuthGuard
    if (payload.tempPasswordChange) {
      ;(req as Request & { tokenScope?: string }).tokenScope = PASSWORD_CHANGE_TOKEN_SCOPE
    }

    // Return full User entity instance (with methods like isSuperAdmin())
    return user
  }
}
