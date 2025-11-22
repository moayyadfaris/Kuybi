import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmailModule } from '@infrastructure/email'

import { CacheService } from '@core/cache/services/cache.service'
import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { RoleRepository } from '@core/database/repositories/role.repository'
import { UserRepository } from '@core/database/repositories/user.repository'

import { AclModule } from '../acl/acl.module'
import { Role } from '../acl/entities/role.entity'
import { UserRole } from '../acl/entities/user-role.entity'
import { AttachmentsModule } from '../attachments/attachments.module'
import { Attachment } from '../attachments/entities/attachment.entity'
import { AuditModule } from '../audit/audit.module'
import { AuthModule } from '../auth/auth.module'

import { AdminUsersController } from './controllers/admin-users.controller'
import { CurrentUserController } from './controllers/current-user.controller'
import { UserRolesController } from './controllers/user-roles.controller'
import { UsersController } from './controllers/users.controller'
import { EmailVerification } from './entities/email-verification.entity'
import { User } from './entities/user.entity'
import { UsersSeeder } from './seeders/users.seeder'
import { AdminPasswordManagementService } from './services/admin-password-management.service'
import { AdminUserManagementService } from './services/admin-user-management.service'
import { UserAvailabilityService } from './services/user-availability.service'
import { UserRolesService } from './services/user-roles.service'
import { UsersService } from './services/users.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRole, Role, EmailVerification, Attachment]),
    AclModule,
    AuditModule,
    EmailModule,
    AttachmentsModule,
    forwardRef(() => AuthModule)
  ],
  controllers: [CurrentUserController, UsersController, UserRolesController, AdminUsersController],
  providers: [
    UsersService,
    UserRolesService,
    UserAvailabilityService,
    AdminPasswordManagementService,
    AdminUserManagementService,
    UserRepository,
    RoleRepository,
    AttachmentRepository,
    CacheService,
    UsersSeeder
  ],

  exports: [UsersService, UserAvailabilityService, UserRepository]
})
export class UsersModule {}
