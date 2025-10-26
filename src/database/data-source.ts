import { config as loadEnv } from 'dotenv'
import { DataSource } from 'typeorm'
import configuration from '../config/configuration'
import { Country } from '../countries/entities/country.entity'
import { User } from '../users/entities/user.entity'
import { Session } from '../auth/entities/session.entity'
import { Attachment } from '../attachments/entities/attachment.entity'
import { Category } from '../categories/entities/category.entity'
import { Story } from '../stories/entities/story.entity'
import { Tag } from '../tags/entities/tag.entity'
import { Role } from '../acl/entities/role.entity'
import { Permission } from '../acl/entities/permission.entity'
import { RolePermission } from '../acl/entities/role-permission.entity'
import { UserRole } from '../acl/entities/user-role.entity'

loadEnv()

const appConfig = configuration()

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: appConfig.database.host,
  port: appConfig.database.port,
  username: appConfig.database.username,
  password: appConfig.database.password,
  database: appConfig.database.name,
  entities: [Country, User, Session, Attachment, Category, Story, Tag, Role, Permission, RolePermission, UserRole],
  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'migrations'
})
