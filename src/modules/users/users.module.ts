import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './entities/user.entity'
import { EmailVerification } from './entities/email-verification.entity'
import { Attachment } from '../attachments/entities/attachment.entity'
import { UsersService } from './services/users.service'
import { UserRepository } from '@core/database/repositories/user.repository'
import { RoleRepository } from '@core/database/repositories/role.repository'
import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { CacheService } from '@core/cache/services/cache.service'
import { UserRolesController } from './controllers/user-roles.controller'
import { AdminUsersController } from './controllers/admin-users.controller'
import { CurrentUserController } from './controllers/current-user.controller'
import { UsersController } from './controllers/users.controller'
import { UserRolesService } from './services/user-roles.service'
import { UserAvailabilityService } from './services/user-availability.service'
import { AdminPasswordManagementService } from './services/admin-password-management.service'
import { AdminUserManagementService } from './services/admin-user-management.service'
import { UserRole } from '../acl/entities/user-role.entity'
import { Role } from '../acl/entities/role.entity'
import { AclModule } from '../acl/acl.module'
import { AuthModule } from '../auth/auth.module'
import { AttachmentsModule } from '../attachments/attachments.module'
import { AuditModule } from '../audit/audit.module'
import { EmailModule } from '@infrastructure/email'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRole, Role, EmailVerification, Attachment]),
    AclModule,
    AuditModule,
    EmailModule,
    AttachmentsModule,
    forwardRef(() => AuthModule)
  ],
  controllers: [UsersController, UserRolesController, AdminUsersController, CurrentUserController],
  providers: [
    UsersService,
    UserRolesService,
    UserAvailabilityService,
    AdminPasswordManagementService,
    AdminUserManagementService,
    UserRepository,
    RoleRepository,
    AttachmentRepository,
    CacheService
  ],
  exports: [UsersService, UserAvailabilityService, UserRepository]
})
export class UsersModule {}
