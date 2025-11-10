import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AbilityFactory } from './ability.factory'
import { CHECK_ABILITY, RequiredRule } from './ability.decorator'

/**
 * Guard to check if user has required permissions
 * Use with @CheckAbility decorator
 */
@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private abilityFactory: AbilityFactory
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get permission requirements from decorator
    const rules = this.reflector.get<RequiredRule[]>(CHECK_ABILITY, context.getHandler())

    // If no rules defined, allow access (permission check not required)
    if (!rules || rules.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request.user

    // User must be authenticated
    if (!user) {
      throw new UnauthorizedException('Authentication required')
    }

    // Super-admin bypasses all permission checks
    // Use User entity method (JWT strategy now returns full User entity)
    if (user.isSuperAdmin && user.isSuperAdmin()) {
      return true
    }

    // Create ability for this user
    const ability = this.abilityFactory.createForUser(user)

    // Check if user has ANY of the required permissions (OR logic)
    const hasPermission = rules.some(rule => ability.can(rule.action, rule.subject))

    if (!hasPermission) {
      // Build helpful error message
      const requiredPermissions = rules.map(r => `${r.action} ${r.subject}`).join(' OR ')

      throw new ForbiddenException(`Insufficient permissions. Required: ${requiredPermissions}`)
    }

    return true
  }
}
