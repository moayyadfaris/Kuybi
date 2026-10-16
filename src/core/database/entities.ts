/**
 * Single source of truth for every TypeORM entity.
 * Used by DatabaseModule, the migration DataSource, and integration tests,
 * so a new entity only needs registering here.
 */
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
import { FieldDefinition } from '@modules/post-types/entities/field-definition.entity'
import { PostContent } from '@modules/post-types/entities/post-content.entity'
import { PostContentAttachment } from '@modules/post-types/entities/post-content-attachment.entity'
import { PostContentCategory } from '@modules/post-types/entities/post-content-category.entity'
import { PostContentTag } from '@modules/post-types/entities/post-content-tag.entity'
import { PostType } from '@modules/post-types/entities/post-type.entity'
import { Story } from '@modules/stories/entities/story.entity'
import { StoryVersion } from '@modules/stories/entities/story-version.entity'
import { Tag } from '@modules/tags/entities/tag.entity'
import { EmailVerification } from '@modules/users/entities/email-verification.entity'
import { User } from '@modules/users/entities/user.entity'

export const ENTITIES = [
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
  PostType,
  FieldDefinition,
  PostContent,
  PostContentAttachment,
  PostContentTag,
  PostContentCategory
]
