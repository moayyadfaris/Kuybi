import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
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
    const authenticatedUser = super.handleRequest(err, user, info, context)

    const request = context.switchToHttp().getRequest<Request & { tokenScope?: string }>()
    if (request.tokenScope === PASSWORD_CHANGE_TOKEN_SCOPE) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_TOKEN_KEY, [
        context.getHandler(),
        context.getClass()
      ])
      if (!allowed) {
        throw new ForbiddenException('Password change required before accessing this resource')
      }
    }

    return authenticatedUser
  }
}
