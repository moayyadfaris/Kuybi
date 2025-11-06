import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User } from '@modules/users/entities/user.entity'

/**
 * Guard to allow access if user is admin OR owns the resource
 *
 * Usage:
 * @UseGuards(JwtAuthGuard, AdminOrOwnerGuard)
 * @SetMetadata('resourceUserIdParam', 'userId')  // which param contains the resource owner ID
 *
 * Example:
 * GET /users/:userId/profile
 * - Admin can access any userId
 * - Regular user can only access their own userId
 */
@Injectable()
export class AdminOrOwnerGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user: User = request.user

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }

    // Admin/Super-admin can access anything
    if (user.isAdmin() || user.isSuperAdmin()) {
      return true
    }

    // Get the parameter name that contains the resource owner's user ID
    const resourceUserIdParam =
      this.reflector.get<string>('resourceUserIdParam', context.getHandler()) || 'userId'

    const resourceUserId = request.params[resourceUserIdParam] || request.body?.userId

    // Check if user owns the resource
    if (resourceUserId && resourceUserId === user.id) {
      return true
    }

    throw new ForbiddenException('Access denied - admin access or ownership required')
  }
}
