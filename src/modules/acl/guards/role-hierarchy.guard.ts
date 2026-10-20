import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { EventBus } from '@core/events'

import { AccessDeniedEvent } from '../events/access-denied.event'
import { RoleRepository } from '../repositories/role.repository'
import { AclPrincipal } from '../types/acl-principal'

/**
 * A caller may only assign or change roles ranked below their own highest role, and never
 * the super-admin role (super-admins bypass the check). Reads the role id from the body
 * (`roleId`) or the route (`:roleId`, `:id`). Which *user* is changed is checked by the
 * service (UserRolesService). Refusals are published (AccessDeniedEvent) for the audit
 * trail: they are attempts to gain or grant privileges.
 */
@Injectable()
export class RoleHierarchyGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(RoleHierarchyGuard.name)
    private readonly logger: PinoLogger,
    private readonly roleRepository: RoleRepository,
    private readonly eventBus: EventBus
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AclPrincipal }>()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }
    if (user.isSuperAdmin()) {
      return true
    }

    const targetRoleId = Number(request.body?.roleId || request.params.roleId || request.params.id)
    if (!Number.isInteger(targetRoleId)) {
      // No role in the request: nothing to rank (the handler validates its input)
      return true
    }

    // Fresh read: a cached priority must not decide a privilege check
    const targetRole = await this.roleRepository.findById(targetRoleId, { bypassCache: true })
    if (!targetRole) {
      // The handler answers 404
      return true
    }

    if (targetRole.name === 'super-admin') {
      this.logger.warn(
        { userId: user.id, targetRoleId, path: request.url },
        'Refused: super-admin role assignment attempt'
      )
      await this.eventBus.publish(
        AccessDeniedEvent.fromRequest(request, user, `role ${targetRoleId}: super-admin only`)
      )
      throw new ForbiddenException('Cannot assign or modify super-admin role')
    }

    const callerPriority = user.getHighestPriorityRole()?.priority || 0
    if (targetRole.priority >= callerPriority) {
      this.logger.warn(
        {
          userId: user.id,
          callerPriority,
          targetRoleId,
          targetRolePriority: targetRole.priority
        },
        'Refused: role ranks at or above the caller'
      )
      await this.eventBus.publish(
        AccessDeniedEvent.fromRequest(request, user, `role ${targetRoleId}: a higher-ranked role`)
      )
      throw new ForbiddenException(
        `Cannot assign role '${targetRole.name}' - insufficient privileges`
      )
    }
    return true
  }
}
