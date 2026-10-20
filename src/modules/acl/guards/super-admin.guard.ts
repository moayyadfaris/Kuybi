import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AclPrincipal } from '../types/acl-principal'

/**
 * Super-admins only, for global administration (other users' sessions, user edits,
 * password resets). Put it after JwtAuthGuard: it reads the authenticated user.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(SuperAdminGuard.name)
    private readonly logger: PinoLogger
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user: AclPrincipal | undefined = request.user

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }
    if (!user.isSuperAdmin()) {
      this.logger.warn(
        { userId: user.id, path: request.url, method: request.method },
        'Super-admin route refused'
      )
      throw new ForbiddenException('Super Admin access required')
    }
    return true
  }
}
