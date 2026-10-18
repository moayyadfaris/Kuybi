/**
 * Single source of truth for every TypeORM entity.
 * Used by DatabaseModule, the migration DataSource, and integration tests,
 * so a new entity only needs registering here.
 */
import { Permission, Role, RolePermission, UserRole } from '@modules/acl/entities'
import { Attachment } from '@modules/attachments/entities'
import { AuditLog } from '@modules/audit/entities'
import { PasswordHistory, PasswordReset, Session } from '@modules/auth/entities'
import { Category } from '@modules/categories/entities'
import { Country } from '@modules/countries/entities'
import {
  FieldDefinition,
  PostContent,
  PostContentAttachment,
  PostContentCategory,
  PostContentTag,
  PostType
} from '@modules/post-types/entities'
import { Story, StoryVersion } from '@modules/stories/entities'
import { Tag } from '@modules/tags/entities'
import { EmailVerification, User } from '@modules/users/entities'

import { OutboxMessage } from '@core/outbox/outbox-message.entity'

export const ENTITIES = [
  OutboxMessage,
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
