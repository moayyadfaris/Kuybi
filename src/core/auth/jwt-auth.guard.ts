import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { ErrorCode } from '@shared/errors'
import { Request } from 'express'

import {
  ALLOW_PASSWORD_CHANGE_TOKEN_KEY,
  PASSWORD_CHANGE_TOKEN_SCOPE
} from './allow-password-change-token.decorator'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext
  ): TUser {
    // The strategy's own rejections (revoked session, inactive user) carry their code
    if (err) throw err
    if (!user) throw new UnauthorizedException(tokenFailure(info))

    const request = context.switchToHttp().getRequest<Request & { tokenScope?: string }>()
    if (request.tokenScope === PASSWORD_CHANGE_TOKEN_SCOPE) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_TOKEN_KEY, [
        context.getHandler(),
        context.getClass()
      ])
      if (!allowed) {
        throw new ForbiddenException({
          code: ErrorCode.AUTH_PASSWORD_CHANGE_REQUIRED,
          message: 'Password change required before accessing this resource'
        })
      }
    }

    return user
  }
}

/**
 * Why passport-jwt rejected the request (its `info`): an expired token can be refreshed,
 * anything else needs a new sign-in
 */
function tokenFailure(info: unknown): { code: ErrorCode; message: string } {
  const name = info instanceof Error ? info.name : undefined
  if (name === 'TokenExpiredError') {
    return { code: ErrorCode.AUTH_TOKEN_EXPIRED, message: 'Access token expired' }
  }
  if (name === 'JsonWebTokenError' || name === 'NotBeforeError') {
    return { code: ErrorCode.AUTH_TOKEN_INVALID, message: 'Invalid access token' }
  }
  return { code: ErrorCode.AUTH_TOKEN_MISSING, message: 'Access token required' }
}
