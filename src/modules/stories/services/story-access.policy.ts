import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'

import { AbilityFactory, Action, asSubject, RecordScope, recordScope, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { Story, StoryStatus } from '../entities/story.entity'
import { STORY_SCOPE_COLUMNS } from '../repositories/story.repository'
import { AUTHOR_STATUSES } from '../story-status.rules'

/**
 * Per-story authorization (e.g. the 'user' role may update only its own stories).
 *
 * Route guards only check the action against the Story type; whether this user may act
 * on *this* story is decided here. The story is tagged with its CASL subject type
 * explicitly: stories served from the cache are plain objects, and CASL would otherwise
 * read their type as "Object" and deny every conditional rule.
 */
@Injectable()
export class StoryAccessPolicy {
  constructor(private readonly abilityFactory: AbilityFactory) {}

  can(user: User, action: Action, story: Story): boolean {
    return this.abilityFactory.createForUser(user).can(action, asSubject(Subject.Story, story))
  }

  /**
   * The stories this user may read, as a filter for list queries. Comes from the same
   * rules as can(): e.g. the 'user' role reads published stories and its own.
   */
  readScope(user: User): RecordScope {
    return recordScope(
      this.abilityFactory.createForUser(user),
      Action.Read,
      Subject.Story,
      STORY_SCOPE_COLUMNS
    )
  }

  /**
   * A story the user may not read is reported as missing (404), not forbidden: a 403
   * would confirm that a hidden draft exists
   */
  assertCanRead(user: User, story: Story): void {
    if (!this.can(user, Action.Read, story)) {
      throw new NotFoundException(`Story with ID ${story.id} not found`)
    }
  }

  assertCan(user: User, action: Action, story: Story, message: string): void {
    if (!this.can(user, action, story)) {
      throw new ForbiddenException(message)
    }
  }

  /**
   * Whether the user may give `story` (or, on create, a new story of theirs) this
   * status. Editorial statuses need Publish, like PATCH /stories/:id/status.
   */
  assertCanSetStatus(user: User, status: StoryStatus, story?: Story): void {
    if (AUTHOR_STATUSES.has(status)) return
    const target = story ?? ({ userId: user.id } as Story)
    this.assertCan(
      user,
      Action.Publish,
      target,
      `You do not have permission to set status ${status}`
    )
  }

  /** Unrestricted access (super-admin) */
  assertCanManageAll(user: User, message: string): void {
    if (!this.abilityFactory.createForUser(user).can(Action.Manage, Subject.All)) {
      throw new ForbiddenException(message)
    }
  }
}
