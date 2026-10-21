import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'

import { AbilityFactory, Action, asSubject, RecordScope, recordScope, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { PostContent } from '../entities/post-content.entity'
import { ContentStatus } from '../enums/content-status.enum'

/** Statuses that make an entry public now or later: setting them needs Publish */
const PUBLISHING = new Set([ContentStatus.PUBLISHED, ContentStatus.SCHEDULED])

/** Content columns a permission condition may name (they become SQL filters) */
export const CONTENT_SCOPE_COLUMNS = ['authorId', 'status', 'postTypeId'] as const

/** No permission at all: nothing beyond published entries */
const NOTHING: RecordScope = { all: false, anyOf: [] }

/**
 * Who sees and changes which entries. Everyone sees published entries of active post
 * types; drafts, scheduled and deleted entries are visible to those who may update that
 * entry. Permissions may carry conditions (e.g. a contributor's own entries:
 * { authorId: '${userId}' }), so every check is made against the entry itself, never
 * just the Content type.
 */
@Injectable()
export class ContentAccessPolicy {
  constructor(private readonly abilityFactory: AbilityFactory) {}

  /** May update some content: sees inactive post types (their entries are still per entry) */
  isEditor(user?: User): boolean {
    return !!user && this.abilityFactory.createForUser(user).can(Action.Update, Subject.Content)
  }

  /** Who may see inactive post types in the type list */
  managesPostTypes(user?: User): boolean {
    return !!user && this.abilityFactory.createForUser(user).can(Action.Update, Subject.PostType)
  }

  can(user: User, action: Action, content: Partial<PostContent>): boolean {
    return this.abilityFactory.createForUser(user).can(action, asSubject(Subject.Content, content))
  }

  /** The entries a viewer may edit, as a list filter (besides the published ones all see) */
  editScope(user?: User): RecordScope {
    if (!user) return NOTHING
    return recordScope(
      this.abilityFactory.createForUser(user),
      Action.Update,
      Subject.Content,
      CONTENT_SCOPE_COLUMNS
    )
  }

  isVisible(content: PostContent, viewer?: User): boolean {
    if (content.status === ContentStatus.PUBLISHED && !content.deletedAt) return true
    return !!viewer && this.can(viewer, Action.Update, content)
  }

  /**
   * For changes: 404 when the user may not even see the entry (a 403 would confirm that a
   * hidden draft exists), 403 when they see it but may not do `action` to it
   */
  assertCanChange(user: User, action: Action, content: PostContent): void {
    if (!this.isVisible(content, user)) throw new NotFoundException('Content not found')
    if (!this.can(user, action, content)) {
      throw new ForbiddenException(`You may not ${action} this entry`)
    }
  }

  /** A new entry must satisfy the conditions of the user's Create permission */
  assertCanCreate(user: User, content: Partial<PostContent>): void {
    if (!this.can(user, Action.Create, content)) {
      throw new ForbiddenException('You may not create this entry')
    }
  }

  /**
   * DELETED is set only by DELETE; PUBLISHED and SCHEDULED need Publish on the entry,
   * whichever route sets them (create, update, schedule)
   */
  assertCanSetStatus(user: User, status: ContentStatus, content: Partial<PostContent>): void {
    if (status === ContentStatus.DELETED) {
      throw new BadRequestException('Use DELETE to delete content')
    }
    if (PUBLISHING.has(status) && !this.can(user, Action.Publish, content)) {
      throw new ForbiddenException(`You do not have permission to set status ${status}`)
    }
  }
}
