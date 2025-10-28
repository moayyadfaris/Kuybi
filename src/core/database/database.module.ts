import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Country } from '@modules/countries/entities/country.entity'
import { User } from '@modules/users/entities/user.entity'
import { Session } from '@modules/auth/entities/session.entity'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { Category } from '@modules/categories/entities/category.entity'
import { Story } from '@modules/stories/entities/story.entity'
import { Tag } from '@modules/tags/entities/tag.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { Permission } from '@modules/acl/entities/permission.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'

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
