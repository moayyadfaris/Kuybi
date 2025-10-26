import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

// Entities
import { Role } from './entities/role.entity'
import { Permission } from './entities/permission.entity'
import { RolePermission } from './entities/role-permission.entity'
import { UserRole } from './entities/user-role.entity'

// Repositories
import { RoleRepository } from '../database/repositories/role.repository'
import { PermissionRepository } from '../database/repositories/permission.repository'

// Services
import { RolesService } from './services/roles.service'
import { PermissionsService } from './services/permissions.service'

// Controllers
import { RolesController } from './controllers/roles.controller'
import { PermissionsController } from './controllers/permissions.controller'

// Abilities
import { AbilityFactory } from './abilities/ability.factory'
import { AbilityGuard } from './abilities/ability.guard'

// Seeders
import { AclSeeder } from './seeders/acl.seeder'

// Cache module
import { CacheConfigModule } from '../cache/cache.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, RolePermission, UserRole]),
    CacheConfigModule,
  ],
  providers: [
    RoleRepository,
    PermissionRepository,
    RolesService,
    PermissionsService,
    AbilityFactory,
    AbilityGuard,
    AclSeeder,
  ],
  controllers: [RolesController, PermissionsController],
  exports: [
    AbilityFactory,
    AbilityGuard,
    RolesService,
    PermissionsService,
  ],
})
export class AclModule {}
