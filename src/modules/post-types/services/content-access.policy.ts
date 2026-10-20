import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'

import { AbilityFactory, Action, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { ContentStatus } from '../enums/content-status.enum'

/** Statuses that make an entry public now or later: setting them needs Publish */
const PUBLISHING = new Set([ContentStatus.PUBLISHED, ContentStatus.SCHEDULED])

/**
 * Who sees and publishes dynamic content. Public readers (no user, or no Update on
 * content) see published entries of active post types only; editors see everything.
 */
@Injectable()
export class ContentAccessPolicy {
  constructor(private readonly abilityFactory: AbilityFactory) {}

  /** Editors: drafts, scheduled and deleted entries, inactive post types */
  isEditor(user?: User): boolean {
    return !!user && this.abilityFactory.createForUser(user).can(Action.Update, Subject.Content)
  }

  /** Who may see inactive post types in the type list */
  managesPostTypes(user?: User): boolean {
    return !!user && this.abilityFactory.createForUser(user).can(Action.Update, Subject.PostType)
  }

  /**
   * DELETED is set only by DELETE; PUBLISHED and SCHEDULED need Publish, whichever route
   * sets them (create, update, schedule)
   */
  assertCanSetStatus(user: User, status: ContentStatus): void {
    if (status === ContentStatus.DELETED) {
      throw new BadRequestException('Use DELETE to delete content')
    }
    if (
      PUBLISHING.has(status) &&
      !this.abilityFactory.createForUser(user).can(Action.Publish, Subject.Content)
    ) {
      throw new ForbiddenException(`You do not have permission to set status ${status}`)
    }
  }
}
