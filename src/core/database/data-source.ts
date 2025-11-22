import { config as loadEnv } from 'dotenv'
import { DataSource } from 'typeorm'

import { Permission } from '@modules/acl/entities/permission.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'
import { PasswordHistory } from '@modules/auth/entities/password-history.entity'
import { PasswordReset } from '@modules/auth/entities/password-reset.entity'
import { Session } from '@modules/auth/entities/session.entity'
import { Category } from '@modules/categories/entities/category.entity'
import { Country } from '@modules/countries/entities/country.entity'
import { Story } from '@modules/stories/entities/story.entity'
import { StoryVersion } from '@modules/stories/entities/story-version.entity'
import { Tag } from '@modules/tags/entities/tag.entity'
import { EmailVerification } from '@modules/users/entities/email-verification.entity'
import { User } from '@modules/users/entities/user.entity'

import configuration from '../config/configuration'

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
    PasswordHistory,
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
