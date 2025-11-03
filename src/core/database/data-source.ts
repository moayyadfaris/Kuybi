import { config as loadEnv } from 'dotenv'
import { DataSource } from 'typeorm'
import configuration from '../config/configuration'
import { Country } from '@modules/countries/entities/country.entity'
import { User } from '@modules/users/entities/user.entity'
import { EmailVerification } from '@modules/users/entities/email-verification.entity'
import { Session } from '@modules/auth/entities/session.entity'
import { PasswordReset } from '@modules/auth/entities/password-reset.entity'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { Category } from '@modules/categories/entities/category.entity'
import { Story } from '@modules/stories/entities/story.entity'
import { StoryVersion } from '@modules/stories/entities/story-version.entity'
import { Tag } from '@modules/tags/entities/tag.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { Permission } from '@modules/acl/entities/permission.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'

loadEnv()

const appConfig = configuration()

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: appConfig.database.host,
  port: appConfig.database.port,
  username: appConfig.database.username,
  password: appConfig.database.password,
  database: appConfig.database.name,
  entities: [
    Country,
    User,
    EmailVerification,
    Session,
    PasswordReset,
    Attachment,
    Category,
    Story,
    StoryVersion,
    Tag,
    Role,
    Permission,
    RolePermission,
    UserRole,
    AuditLog
  ],
  migrations: ['src/core/database/migrations/*.ts'],
  migrationsTableName: 'migrations'
})
