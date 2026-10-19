import type { Role } from '../entities/role.entity'
import type { UserRole } from '../entities/user-role.entity'

/**
 * What the acl module needs to know about an authenticated principal. acl is a base
 * module: feature modules depend on it, never the other way round, so it describes the
 * principal it authorizes instead of importing the users module's User entity (which
 * implements this interface).
 */
export interface AclPrincipal {
  id: string
  email?: string
  /** The primary role, with its permissions loaded */
  primaryRole?: Role | null
  /** Additional role assignments, with their roles and permissions loaded */
  userRoles?: UserRole[]
  isSuperAdmin(): boolean
  isAdmin(): boolean
  getPrimaryRoleName(): string
  getHighestPriorityRole(): Role | null
}
