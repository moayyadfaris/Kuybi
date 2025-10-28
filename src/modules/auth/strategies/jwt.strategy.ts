import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { TokenBlacklistService } from '../services/token-blacklist.service'
import { Request } from 'express'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectPinoLogger(JwtStrategy.name)
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('auth.jwtSecret'),
      passReqToCallback: true // Enable access to the request object
    })
  }

  async validate(req: Request, payload: any) {
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

    // Return user data to be attached to request
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role
    }
  }
}
