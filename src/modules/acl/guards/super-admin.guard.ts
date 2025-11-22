import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { User } from '@modules/users/entities/user.entity'

/**
 * Guard to restrict access to super-admin users only
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, SuperAdminGuard)
 *
 * IMPORTANT: Must be used AFTER JwtAuthGuard
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(SuperAdminGuard.name)
    private readonly logger: PinoLogger,
    private reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user: User = request.user

    if (!user) {
      this.logger.warn('SuperAdminGuard: No user in request')
      throw new ForbiddenException('Authentication required')
    }

    // Check using User entity methods (authoritative)
    const isSuperAdmin = user.isSuperAdmin()

    if (!isSuperAdmin) {
      this.logger.warn(
        {
          userId: user.id,
          email: user.email,
          primaryRole: user.getPrimaryRoleName(),
          path: request.url,
          method: request.method
        },
        'SuperAdminGuard: Access denied - super-admin required'
      )

      throw new ForbiddenException('Super Admin access required')
    }

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        path: request.url,
        method: request.method
      },
      'SuperAdminGuard: Access granted'
    )

    return true
  }
}
