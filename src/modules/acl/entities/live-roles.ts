import type { Role } from './role.entity'
import type { UserRole } from './user-role.entity'

/** A role grants anything only while active and not deleted */
export const isLiveRole = (role?: Role | null): role is Role => !!role?.isActive && !role.deletedAt

/**
 * The roles that count for a principal: the primary role while live, and each additional
 * role while its assignment is active and unexpired and the role itself is live. Every
 * role check (ability, super-admin bypass, hasRole, hierarchy ranking) goes through this.
 * `expiresAt` may be a string when the principal was read back from the cache.
 */
export function liveRoles(principal: {
  primaryRole?: Role | null
  userRoles?: UserRole[] | null
}): Role[] {
  const now = Date.now()
  const roles = new Map<number, Role>()
  if (isLiveRole(principal.primaryRole)) roles.set(principal.primaryRole.id, principal.primaryRole)
  for (const assignment of principal.userRoles ?? []) {
    const current =
      assignment.isActive &&
      (!assignment.expiresAt || new Date(assignment.expiresAt).getTime() > now)
    if (current && isLiveRole(assignment.role)) roles.set(assignment.role.id, assignment.role)
  }
  return [...roles.values()]
}
