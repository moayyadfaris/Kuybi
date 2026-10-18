import { ExecutionContext, Injectable } from '@nestjs/common'
import { Request } from 'express'

import { JwtAuthGuard } from './jwt-auth.guard'

/**
 * For public routes that show more to some signed-in users (e.g. drafts to editors).
 * No Authorization header: the request continues anonymously (req.user undefined).
 * A header is verified exactly as by JwtAuthGuard, so a bad token is still a 401
 * rather than a silent downgrade.
 */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>()
    if (!request.headers.authorization) {
      return true
    }
    return super.canActivate(context)
  }
}
