import { DomainEvent } from '@core/events'

/**
 * An administrator replaced a user's password. Every existing session of that user
 * must stop working; the auth module revokes them.
 */
export class UserCredentialsResetEvent extends DomainEvent {
  static readonly eventName = 'users.credentials.reset'

  constructor(
    readonly userId: string,
    readonly resetBy: string,
    readonly reason: string
  ) {
    super()
  }
}
