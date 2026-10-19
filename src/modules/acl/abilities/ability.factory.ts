import { Injectable } from '@nestjs/common'
import {
  AbilityBuilder,
  createMongoAbility,
  ForcedSubject,
  MongoAbility,
  MongoQuery,
  RawRuleOf,
  subject as tagSubject
} from '@casl/ability'

import { Role } from '../entities/role.entity'
import { AclPrincipal } from '../types/acl-principal'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

/** An object tagged with its subject type, for checks against conditional rules */
export type SubjectInstance = Record<PropertyKey, unknown> & ForcedSubject<Subject>

/**
 * What abilities are checked against: a subject type (route-level checks) or a tagged
 * object (per-record checks). Subjects are strings, so acl needs no feature-module
 * classes.
 */
export type Subjects = Subject | SubjectInstance
// Conditions come from the permissions table, so they are untyped Mongo queries
export type AppAbility = MongoAbility<[Action, Subjects], MongoQuery>

/**
 * Tags a record with its subject type for a per-record check. Always tag explicitly:
 * records served from the cache are plain objects, which CASL would see as "Object"
 * and deny every conditional rule.
 */
export function asSubject(type: Subject, record: object): SubjectInstance {
  return tagSubject(type, { ...record } as Record<PropertyKey, unknown>)
}

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
  createForUser(user: AclPrincipal | null | undefined): AppAbility {
    if (!user) {
      // Guest user - no permissions by default
      return createMongoAbility<AppAbility>([])
    }

    // Super-admin gets unrestricted access to everything
    if (user.isSuperAdmin?.()) {
      return createMongoAbility<AppAbility>([{ action: Action.Manage, subject: Subject.All }])
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
    const rules: RawRuleOf<AppAbility>[] = []
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

        // A permission row is a raw CASL rule; `inverted` makes it a "cannot"
        rules.push({
          action: permission.action,
          subject: permission.subject,
          fields,
          conditions: conditions as MongoQuery | undefined,
          inverted: permission.inverted
        })
      }
    }

    return createMongoAbility<AppAbility>(rules)
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
