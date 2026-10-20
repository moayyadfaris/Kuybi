import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AclPrincipal } from '../types/acl-principal'

import { CHECK_ABILITY, RequiredRule } from './ability.decorator'
import { AbilityFactory } from './ability.factory'

/**
 * Route-level permission check: the user needs any one of the @CheckAbility rules
 * (handler or class) against the subject type. Per-record conditions (own story, own
 * attachment...) are checked by the feature's access policy, not here: with a type, CASL
 * answers "may do this to some record".
 *
 * Fails closed: a route behind this guard without @CheckAbility is refused, so a missing
 * decorator cannot open a route to every signed-in user.
 */
@Injectable()
export class AbilityGuard implements CanActivate {
  private readonly logger = new Logger(AbilityGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rules = this.reflector.getAllAndOverride<RequiredRule[]>(CHECK_ABILITY, [
      context.getHandler(),
      context.getClass()
    ])
    if (!rules || rules.length === 0) {
      this.logger.error(
        `${context.getClass().name}.${context.getHandler().name} uses AbilityGuard without @CheckAbility`
      )
      throw new ForbiddenException('Access denied')
    }

    const user: AclPrincipal | undefined = context.switchToHttp().getRequest().user
    if (!user) {
      throw new UnauthorizedException('Authentication required')
    }

    const ability = this.abilityFactory.createForUser(user)
    if (!rules.some(rule => ability.can(rule.action, rule.subject))) {
      const required = rules.map(r => `${r.action} ${r.subject}`).join(' OR ')
      throw new ForbiddenException(`Insufficient permissions. Required: ${required}`)
    }
    return true
  }
}
