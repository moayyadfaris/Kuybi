import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

// Entities
import { Role } from './entities/role.entity'
import { Permission } from './entities/permission.entity'
import { RolePermission } from './entities/role-permission.entity'
import { UserRole } from './entities/user-role.entity'

// Repositories
import { RoleRepository } from '@core/database/repositories/role.repository'
import { PermissionRepository } from '@core/database/repositories/permission.repository'

// Services
import { RolesService } from './services/roles.service'
import { PermissionsService } from './services/permissions.service'

// Controllers
import { RolesController } from './controllers/roles.controller'
import { PermissionsController } from './controllers/permissions.controller'

// Abilities
import { AbilityFactory } from './abilities/ability.factory'
import { AbilityGuard } from './abilities/ability.guard'

// Guards
import { SuperAdminGuard } from './guards/super-admin.guard'
import { RoleHierarchyGuard } from './guards/role-hierarchy.guard'
import { AdminOrOwnerGuard } from './guards/admin-or-owner.guard'

// Seeders
import { AclSeeder } from './seeders/acl.seeder'

// Cache module
import { CacheConfigModule } from '@core/cache/cache.module'

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
