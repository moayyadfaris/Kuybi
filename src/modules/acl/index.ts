/**
 * Public API of the acl module. Other modules import only from here
 * (or from @modules/acl/entities); everything else is internal.
 */
export { CheckAbility } from './abilities/ability.decorator'
export type { AppAbility, SubjectInstance } from './abilities/ability.factory'
export { AbilityFactory, asSubject } from './abilities/ability.factory'
export { AbilityGuard } from './abilities/ability.guard'
export type { RecordScope, ScopeValue } from './abilities/record-scope'
export { recordScope } from './abilities/record-scope'
export { AclModule } from './acl.module'
export { findDefaultRoleId } from './default-role'
export { AssignRoleDto } from './dto/assign-role.dto'
export { AclChangedEvent } from './events/acl-changed.event'
export { RoleHierarchyGuard } from './guards/role-hierarchy.guard'
export { SuperAdminGuard } from './guards/super-admin.guard'
export { RoleRepository } from './repositories/role.repository'
export { UserRoleRepository } from './repositories/user-role.repository'
export { AclSeeder } from './seeders/acl.seeder'
export type { AclPrincipal } from './types/acl-principal'
export { Action } from './types/actions.enum'
export { Subject } from './types/subjects.enum'
