import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { RoleRepository } from '../repositories/role.repository'
import { AclPrincipal } from '../types/acl-principal'

/**
 * A caller may only assign or change roles ranked below their own highest role, and never
 * the super-admin role (super-admins bypass the check). Reads the role id from the body
 * (`roleId`) or the route (`:roleId`, `:id`). Which *user* is changed is checked by the
 * service (UserRolesService).
 */
@Injectable()
export class RoleHierarchyGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(RoleHierarchyGuard.name)
    private readonly logger: PinoLogger,
    private readonly roleRepository: RoleRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const user: AclPrincipal | undefined = request.user

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
      throw new ForbiddenException(
        `Cannot assign role '${targetRole.name}' - insufficient privileges`
      )
    }
    return true
  }
}
