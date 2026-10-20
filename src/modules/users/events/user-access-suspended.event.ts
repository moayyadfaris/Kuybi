import { DomainEvent } from '@core/events'

/**
 * An administrator locked or deactivated a user. Like a credentials reset, every
 * existing session of that user must stop working; the auth module revokes them.
 */
export class UserAccessSuspendedEvent extends DomainEvent {
  static readonly eventName = 'users.access.suspended'

  constructor(
    readonly userId: string,
    readonly suspendedBy: string,
    readonly reason: string
  ) {
    super()
  }
}
