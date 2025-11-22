import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Repository } from 'typeorm'

import { User } from '@modules/users/entities/user.entity'

import { Role } from '../entities/role.entity'

/**
 * Guard to enforce role hierarchy rules
 * Prevents users from assigning roles equal to or higher than their own
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, AbilityGuard, RoleHierarchyGuard)
 *
 * Checks request body for: roleId
 * Checks request params for: id (when modifying roles)
 */
@Injectable()
export class RoleHierarchyGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(RoleHierarchyGuard.name)
    private readonly logger: PinoLogger,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const user: User = request.user
    const body = request.body
    const params = request.params

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }

    // Super-admin bypasses all hierarchy checks
    if (user.isSuperAdmin()) {
      this.logger.info({ userId: user.id }, 'RoleHierarchyGuard: Super-admin bypass')
      return true
    }

    // Get target role being assigned/modified
    const targetRoleId = body.roleId || params.id || params.roleId
    if (!targetRoleId) {
      // No role in request, allow (let controller validate)
      return true
    }

    const targetRole = await this.roleRepository.findOne({
      where: { id: targetRoleId }
    })

    if (!targetRole) {
      // Role not found, let controller handle
      return true
    }

    // CRITICAL: Prevent assigning super-admin role
    if (targetRole.name === 'super-admin') {
      this.logger.warn(
        {
          userId: user.id,
          targetRoleId,
          targetRoleName: targetRole.name,
          path: request.url
        },
        'RoleHierarchyGuard: Blocked super-admin role assignment attempt'
      )

      throw new ForbiddenException('Cannot assign or modify super-admin role')
    }

    // Get user's highest priority
    const userHighestRole = user.getHighestPriorityRole()
    const userMaxPriority = userHighestRole?.priority || 0

    // Can only assign roles with lower priority
    if (targetRole.priority >= userMaxPriority) {
      this.logger.warn(
        {
          userId: user.id,
          userPriority: userMaxPriority,
          targetRolePriority: targetRole.priority,
          targetRoleName: targetRole.name
        },
        'RoleHierarchyGuard: Blocked - insufficient priority'
      )

      throw new ForbiddenException(
        `Cannot assign role '${targetRole.name}' - insufficient privileges`
      )
    }

    this.logger.info(
      {
        userId: user.id,
        userPriority: userMaxPriority,
        targetRolePriority: targetRole.priority,
        targetRoleName: targetRole.name
      },
      'RoleHierarchyGuard: Hierarchy check passed'
    )

    return true
  }
}
