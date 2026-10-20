import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { EventBus } from '@core/events'

import { AccessDeniedEvent } from '../events/access-denied.event'
import { AclPrincipal } from '../types/acl-principal'

/**
 * Super-admins only, for global administration (other users' sessions, user edits,
 * password resets). Put it after JwtAuthGuard: it reads the authenticated user. Refusals
 * are published (AccessDeniedEvent) for the audit trail.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(SuperAdminGuard.name)
    private readonly logger: PinoLogger,
    private readonly eventBus: EventBus
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AclPrincipal }>()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }
    if (!user.isSuperAdmin()) {
      this.logger.warn(
        { userId: user.id, path: request.url, method: request.method },
        'Super-admin route refused'
      )
      await this.eventBus.publish(AccessDeniedEvent.fromRequest(request, user, 'super-admin'))
      throw new ForbiddenException('Super Admin access required')
    }
    return true
  }
}
