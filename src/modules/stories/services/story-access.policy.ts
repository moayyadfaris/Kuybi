import { ForbiddenException, Injectable } from '@nestjs/common'
import { subject } from '@casl/ability'

import { AbilityFactory, Action, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { Story } from '../entities/story.entity'

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
    return this.abilityFactory
      .createForUser(user)
      .can(action, subject(Subject.Story, story) as unknown as Story)
  }

  assertCan(user: User, action: Action, story: Story, message: string): void {
    if (!this.can(user, action, story)) {
      throw new ForbiddenException(message)
    }
  }

  /** Unrestricted access (super-admin) */
  assertCanManageAll(user: User, message: string): void {
    if (!this.abilityFactory.createForUser(user).can(Action.Manage, Subject.All)) {
      throw new ForbiddenException(message)
    }
  }
}
