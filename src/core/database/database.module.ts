import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Country } from '@modules/countries/entities/country.entity'
import { User } from '@modules/users/entities/user.entity'
import { EmailVerification } from '@modules/users/entities/email-verification.entity'
import { Session } from '@modules/auth/entities/session.entity'
import { PasswordReset } from '@modules/auth/entities/password-reset.entity'
import { PasswordHistory } from '@modules/auth/entities/password-history.entity'
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
import { PostType } from '@modules/post-types/entities/post-type.entity'
import { FieldDefinition } from '@modules/post-types/entities/field-definition.entity'
import { PostContent } from '@modules/post-types/entities/post-content.entity'
import { PostContentAttachment } from '@modules/post-types/entities/post-content-attachment.entity'
import { PostContentTag } from '@modules/post-types/entities/post-content-tag.entity'
import { PostContentCategory } from '@modules/post-types/entities/post-content-category.entity'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const database = configService.get('database')
        const poolConfig = database?.pool || {}

        const config: any = {
          type: 'postgres',
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.name,
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
            AuditLog,
            // Dynamic Post Types System
            PostType,
            FieldDefinition,
            PostContent,
            PostContentAttachment,
            PostContentTag,
            PostContentCategory
          ],
          synchronize: false,
          logging: database.logging
        }

        // Add connection pooling if enabled
        if (poolConfig?.enabled) {
          config.extra = {
            min: poolConfig.min,
            max: poolConfig.max,
            idleTimeoutMillis: poolConfig.idleTimeoutMillis,
            connectionTimeoutMillis: poolConfig.acquireTimeoutMillis
          }
        }

        return config
      }
    })
  ]
})
export class DatabaseModule {}
