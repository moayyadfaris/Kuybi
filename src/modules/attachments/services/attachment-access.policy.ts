import { ForbiddenException, Injectable } from '@nestjs/common'

import { AbilityFactory, Action, asSubject, Subject } from '@modules/acl'
import { User } from '@modules/users/entities'

import { Attachment } from '../entities/attachment.entity'

type AttachmentFacts = Pick<Attachment, 'userId' | 'isPublic'>

/**
 * Per-file authorization. Regular users may read their own files and public ones;
 * roles with an unconditional rule (editors, admins) may read everything.
 *
 * Objects are tagged with their CASL subject type because cached attachments are plain
 * objects, which CASL would otherwise treat as type "Object" and deny.
 */
@Injectable()
export class AttachmentAccessPolicy {
  constructor(private readonly abilityFactory: AbilityFactory) {}

  can(user: User, action: Action, attachment: AttachmentFacts): boolean {
    return this.abilityFactory
      .createForUser(user)
      .can(action, asSubject(Subject.Attachment, attachment))
  }

  assertCan(user: User, action: Action, attachment: AttachmentFacts, message: string): void {
    if (!this.can(user, action, attachment)) {
      throw new ForbiddenException(message)
    }
  }

  /** Whether the user may read other people's private files (decides list filtering) */
  canReadAll(user: User): boolean {
    return this.can(user, Action.Read, { userId: '\u0000nobody', isPublic: false })
  }
}
