import { Injectable } from '@nestjs/common'
import {
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
   * The user's ability: the permissions of their live roles (see below), with super-admins
   * allowed everything. No user (unauthenticated) gets an ability that allows nothing.
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

    // Roles grant permissions while active and not deleted; additional role assignments
    // also while the assignment is active and unexpired
    const now = new Date()
    const isLive = (role?: Role | null): role is Role => !!role?.isActive && !role.deletedAt
    const rolesById = new Map<number, Role>()
    if (isLive(user.primaryRole)) {
      rolesById.set(user.primaryRole.id, user.primaryRole)
    }
    for (const userRole of user.userRoles ?? []) {
      const isCurrent =
        userRole.isActive &&
        isLive(userRole.role) &&
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
   * Replaces the `${userId}` placeholder in a permission's conditions with the user's id.
   * Top-level values only: a nested `${userId}` is left as is (and matches nothing).
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
