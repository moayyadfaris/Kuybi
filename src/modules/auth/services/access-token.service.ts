import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { StringValue } from 'ms'

import { User } from '@modules/users/entities'

import type { AccessTokenPayload } from '../types/jwt-payload'

/** Issues the JWT access tokens verified by JwtStrategy */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Access tokens carry the session id (`sid`): JwtStrategy rejects them as soon as
   * that session is revoked, instead of when the token expires.
   */
  async issueForSession(user: User, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.getPrimaryRoleName(),
      sid: sessionId
    }
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('auth.jwtAccessExpiresIn') as StringValue
    })
  }

  /**
   * Temporary token for a forced password change: no session exists yet, it is valid
   * for 15 minutes and JwtAuthGuard only accepts it on @AllowPasswordChangeToken routes.
   */
  async issuePasswordChangeToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.getPrimaryRoleName(),
      tempPasswordChange: true
    }
    return this.jwtService.signAsync(payload, { expiresIn: '15m' })
  }
}
