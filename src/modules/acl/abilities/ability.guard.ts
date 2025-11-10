import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
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
    private abilityFactory: AbilityFactory,
    @InjectPinoLogger(AbilityGuard.name)
    private readonly logger: PinoLogger
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

    // Debug logging
    this.logger.debug(
      {
        userId: user.id,
        email: user.email,
        hasPrimaryRole: !!user.primaryRole,
        primaryRoleName: user.primaryRole?.name,
        hasUserRoles: !!user.userRoles,
        userRolesCount: user.userRoles?.length || 0,
        hasIsSuperAdminMethod: typeof user.isSuperAdmin === 'function',
        path: request.url
      },
      'AbilityGuard: Checking permissions'
    )

    // Super-admin bypasses all permission checks
    // Use User entity method (JWT strategy now returns full User entity)
    if (user.isSuperAdmin && user.isSuperAdmin()) {
      this.logger.debug({ userId: user.id }, 'AbilityGuard: Super-admin access granted')
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
