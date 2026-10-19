import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EmailModule } from '@infrastructure/email'

import { AclModule } from '@modules/acl'
import { AttachmentsModule } from '@modules/attachments'
import { AuditModule } from '@modules/audit'

import { SecurityModule } from '@core/security'

import { AdminUsersController } from './controllers/admin-users.controller'
import { CurrentUserController } from './controllers/current-user.controller'
import { UserRolesController } from './controllers/user-roles.controller'
import { UsersController } from './controllers/users.controller'
import { EmailVerification } from './entities/email-verification.entity'
import { User } from './entities/user.entity'
import { EmailVerificationRepository } from './repositories/email-verification.repository'
import { UserRepository } from './repositories/user.repository'
import { UsersSeeder } from './seeders/users.seeder'
import { AdminPasswordManagementService } from './services/admin-password-management.service'
import { AdminUserManagementService } from './services/admin-user-management.service'
import { UserAvailabilityService } from './services/user-availability.service'
import { UserRolesService } from './services/user-roles.service'
import { UsersService } from './services/users.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmailVerification]),
    AclModule,
    AuditModule,
    SecurityModule,
    EmailModule,
    AttachmentsModule
  ],
  controllers: [CurrentUserController, UsersController, UserRolesController, AdminUsersController],
  providers: [
    UsersService,
    UserRolesService,
    UserAvailabilityService,
    AdminPasswordManagementService,
    AdminUserManagementService,
    UserRepository,
    EmailVerificationRepository,
    UsersSeeder
  ],
  exports: [UsersService, UserAvailabilityService, UserRepository, EmailVerificationRepository]
})
export class UsersModule {}
