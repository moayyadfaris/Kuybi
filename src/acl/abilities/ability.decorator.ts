import { SetMetadata } from '@nestjs/common'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

/**
 * Interface for required permission rules
 */
export interface RequiredRule {
  action: Action
  subject: Subject
}

/**
 * Metadata key for ability checks
 */
export const CHECK_ABILITY = 'check_ability'

/**
 * Decorator to protect routes with permission checks
 * 
 * @example
 * // Single permission check
 * @CheckAbility({ action: Action.Create, subject: Subject.Story })
 * 
 * // Multiple permission checks (OR logic - user needs ANY of these)
 * @CheckAbility(
 *   { action: Action.Update, subject: Subject.Story },
 *   { action: Action.Manage, subject: Subject.All }
 * )
 * 
 * @param requirements - One or more permission requirements
 */
export const CheckAbility = (...requirements: RequiredRule[]) =>
  SetMetadata(CHECK_ABILITY, requirements)
