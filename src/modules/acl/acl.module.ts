import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

// Cache module
import { CacheConfigModule } from '@core/cache/cache.module'
import { PermissionRepository } from '@core/database/repositories/permission.repository'
// Repositories
import { RoleRepository } from '@core/database/repositories/role.repository'

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
import { AdminOrOwnerGuard } from './guards/admin-or-owner.guard'
import { RoleHierarchyGuard } from './guards/role-hierarchy.guard'
// Guards
import { SuperAdminGuard } from './guards/super-admin.guard'
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
    RolesService,
    PermissionsService,
    AbilityFactory,
    AbilityGuard,
    SuperAdminGuard,
    RoleHierarchyGuard,
    AdminOrOwnerGuard,
    AclSeeder
  ],
  controllers: [RolesController, PermissionsController],
  exports: [
    AbilityFactory,
    AbilityGuard,
    SuperAdminGuard,
    RoleHierarchyGuard,
    AdminOrOwnerGuard,
    RolesService,
    PermissionsService,
    TypeOrmModule
  ]
})
export class AclModule {}
