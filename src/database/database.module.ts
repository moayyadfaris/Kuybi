import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
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

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const database = configService.get('database')
        return {
          type: 'postgres',
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.name,
          entities: [Country, User, Session, Attachment, Category, Story, Tag, Role, Permission, RolePermission, UserRole],
          synchronize: false,
          logging: database.logging
        }
      }
    })
  ]
})
export class DatabaseModule {}
