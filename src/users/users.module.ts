import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './entities/user.entity'
import { UsersService } from './users.service'
import { UserRepository } from '../database/repositories/user.repository'
import { CacheService } from '../cache/services/cache.service'
import { UserRolesController } from './controllers/user-roles.controller'
import { UserRolesService } from './services/user-roles.service'
import { UserRole } from '../acl/entities/user-role.entity'
import { Role } from '../acl/entities/role.entity'
import { AclModule } from '../acl/acl.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRole, Role]),
    AclModule
  ],
  controllers: [UserRolesController],
  providers: [UsersService, UserRolesService, UserRepository, CacheService],
  exports: [UsersService, UserRepository]
})
export class UsersModule {}
