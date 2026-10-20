import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

// Cache module
import { CacheConfigModule } from '@core/cache/cache.module'

// Abilities
import { AbilityFactory } from './abilities/ability.factory'
import { AbilityGuard } from './abilities/ability.guard'
import { PermissionsController } from './controllers/permissions.controller'
// Controllers
import { RolesController } from './controllers/roles.controller'
import { Permission } from './entities/permission.entity'
// Entities
import { Role } from './entities/role.entity'
import { RolePermission } from './entities/role-permission.entity'
import { UserRole } from './entities/user-role.entity'
import { RoleHierarchyGuard } from './guards/role-hierarchy.guard'
// Guards
import { SuperAdminGuard } from './guards/super-admin.guard'
import { PermissionRepository } from './repositories/permission.repository'
// Repositories
import { RoleRepository } from './repositories/role.repository'
import { UserRoleRepository } from './repositories/user-role.repository'
// Seeders
import { AclSeeder } from './seeders/acl.seeder'
import { PermissionsService } from './services/permissions.service'
// Services
import { RolesService } from './services/roles.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, RolePermission, UserRole]),
    CacheConfigModule
  ],
  providers: [
    RoleRepository,
    PermissionRepository,
    UserRoleRepository,
    RolesService,
    PermissionsService,
    AbilityFactory,
    AbilityGuard,
    SuperAdminGuard,
    RoleHierarchyGuard,
    AclSeeder
  ],
  controllers: [RolesController, PermissionsController],
  exports: [
    AbilityFactory,
    AbilityGuard,
    SuperAdminGuard,
    RoleHierarchyGuard,
    RolesService,
    PermissionsService,
    RoleRepository,
    PermissionRepository,
    UserRoleRepository
  ]
})
export class AclModule {}
