import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { UserRepository } from '@core/database/repositories/user.repository'

import { TokenBlacklistService } from '../services/token-blacklist.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectPinoLogger(JwtStrategy.name)
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly userRepository: UserRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('auth.jwtSecret'),
      passReqToCallback: true // Enable access to the request object
    })
  }

  async validate(req: Request, payload: { sub: string; email: string; role: string }) {
    // Extract the raw JWT token from the request
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    if (!token) {
      throw new UnauthorizedException('Access token not found')
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
      throw new UnauthorizedException('Token has been revoked')
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
      throw new UnauthorizedException('User not found')
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
      throw new UnauthorizedException('User account is inactive')
    }

    // Return full User entity instance (with methods like isSuperAdmin())
    return user
  }
}
