/**
 * ACL (Access Control List) Module
 *
 * Provides enterprise-grade role-based access control using CASL.
 *
 * Features:
 * - Fine-grained permissions with action-subject pairs
 * - Dynamic permission conditions (e.g., ownership checks)
 * - Field-level access control
 * - Role-based permissions with priority
 * - Time-based role assignments
 * - System roles protection
 * - Caching for performance
 *
 * Usage:
 * ```typescript
 * // Protect a controller endpoint
 * @UseGuards(JwtAuthGuard, AbilityGuard)
 * @CheckAbility({ action: Action.Create, subject: Subject.Story })
 * async createStory() { ... }
 *
 * // Check permissions in code
 * const ability = await this.abilityFactory.createForUser(user)
 * if (ability.can(Action.Update, story)) { ... }
 * ```
 */

export * from './abilities'
export * from './acl.module'
export * from './controllers'
export * from './dto'
export * from './entities'
export * from './services'
export * from './types'
