import { Injectable } from '@nestjs/common'
import { AbilityBuilder, createMongoAbility, InferSubjects, MongoAbility } from '@casl/ability'

import { Story } from '@modules/stories/entities'
import { User } from '@modules/users/entities'

import { Role } from '../entities/role.entity'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

/**
 * Type definition for application abilities
 * Represents what actions can be performed on which subjects
 */
export type Subjects = InferSubjects<typeof Story | typeof User> | Subject
export type AppAbility = MongoAbility<[Action, Subjects]>

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
    // Use User entity method (JWT strategy now returns full User entity)
    if (user.isSuperAdmin && user.isSuperAdmin()) {
      can(Action.Manage, Subject.All)
      return build()
    }

    // The primary role always applies; additional roles apply while active and unexpired
    const now = new Date()
    const rolesById = new Map<number, Role>()
    if (user.primaryRole?.isActive) {
      rolesById.set(user.primaryRole.id, user.primaryRole)
    }
    for (const userRole of user.userRoles ?? []) {
      const isCurrent =
        userRole.isActive &&
        userRole.role?.isActive &&
        (!userRole.expiresAt || new Date(userRole.expiresAt) > now)
      if (isCurrent) {
        rolesById.set(userRole.role.id, userRole.role)
      }
    }

    // Collect all permissions from all active roles
    for (const role of rolesById.values()) {
      if (!role.rolePermissions) {
        continue
      }

      for (const rolePermission of role.rolePermissions) {
        const permission = rolePermission.permission

        // Replace ${userId} placeholder in conditions with actual user ID.
        // Empty fields/conditions mean "unrestricted"; CASL rejects an empty fields array.
        const conditions =
          permission.conditions && Object.keys(permission.conditions).length > 0
            ? this.interpolateConditions(permission.conditions, user.id)
            : undefined
        const fields = permission.fields?.length ? permission.fields : undefined

        // Define ability based on permission
        if (permission.inverted) {
          // Cannot permission
          cannot(permission.action, permission.subject, fields, conditions)
        } else {
          // Can permission
          can(permission.action, permission.subject, fields, conditions)
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
    conditions: Record<string, unknown> | undefined,
    userId: string
  ): Record<string, unknown> | undefined {
    if (!conditions) {
      return undefined
    }

    const interpolated: Record<string, unknown> = {}

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
