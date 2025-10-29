import { Injectable } from '@nestjs/common'
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'
import { User } from '../../users/entities/user.entity'

/**
 * Type definition for application abilities
 * Represents what actions can be performed on which subjects
 */
export type AppAbility = MongoAbility<[Action, Subject]>

/**
 * Factory for creating user-specific CASL abilities
 * Builds permission sets based on user roles
 */
@Injectable()
export class AbilityFactory {
  /**
   * Create an Ability instance for a specific user
   * @param user - User with loaded roles and permissions
   * @returns AppAbility instance with all user permissions
   */
  createForUser(user: User): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    if (!user) {
      // Guest user - no permissions by default
      return build()
    }

    // Super-admin gets unrestricted access to everything
    // Check both JWT payload role and User entity method
    const isSuperAdmin =
      (user as any).role === 'super-admin' || (user.isSuperAdmin && user.isSuperAdmin())

    if (isSuperAdmin) {
      can(Action.Manage, Subject.All)
      return build()
    }

    // Get active, non-expired roles
    const activeRoles =
      user.userRoles?.filter(
        ur =>
          ur.isActive && ur.role.isActive && (!ur.expiresAt || new Date(ur.expiresAt) > new Date())
      ) || []

    // Collect all permissions from all active roles
    for (const userRole of activeRoles) {
      const role = userRole.role

      if (!role.rolePermissions) {
        continue
      }

      for (const rolePermission of role.rolePermissions) {
        const permission = rolePermission.permission

        // Replace ${userId} placeholder in conditions with actual user ID
        const conditions = this.interpolateConditions(permission.conditions, user.id)

        // Define ability based on permission
        if (permission.inverted) {
          // Cannot permission
          cannot(permission.action, permission.subject, permission.fields, conditions)
        } else {
          // Can permission
          can(permission.action, permission.subject, permission.fields, conditions)
        }
      }
    }

    return build()
  }

  /**
   * Create ability for a guest (unauthenticated) user
   * @returns AppAbility with minimal permissions
   */
  createForGuest(): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

    // Public read access
    can(Action.Read, Subject.Country)
    can(Action.Read, Subject.Category)
    can(Action.Read, Subject.Tag)

    return build()
  }

  /**
   * Replace placeholder values in conditions with actual user data
   * @param conditions - Permission conditions object
   * @param userId - Current user's ID
   * @returns Interpolated conditions object
   */
  private interpolateConditions(
    conditions: Record<string, any> | undefined,
    userId: string
  ): Record<string, any> | undefined {
    if (!conditions) {
      return undefined
    }

    const interpolated: Record<string, any> = {}

    for (const [key, value] of Object.entries(conditions)) {
      if (typeof value === 'string' && value === '${userId}') {
        interpolated[key] = userId
      } else {
        interpolated[key] = value
      }
    }

    return interpolated
  }
}
