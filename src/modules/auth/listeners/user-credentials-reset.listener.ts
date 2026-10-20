import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { UserAccessSuspendedEvent, UserCredentialsResetEvent } from '@modules/users'

import { OnDomainEvent } from '@core/events'

import { SessionsService } from '../services/sessions.service'

/**
 * Ends every session of a user when an administrator resets their password, or locks or
 * deactivates the account: whoever holds those sessions must not keep access.
 */
@Injectable()
export class UserCredentialsResetListener {
  constructor(
    private readonly sessionsService: SessionsService,
    @InjectPinoLogger(UserCredentialsResetListener.name)
    private readonly logger: PinoLogger
  ) {}

  @OnDomainEvent(UserCredentialsResetEvent)
  async revokeSessions(event: UserCredentialsResetEvent): Promise<void> {
    const revokedSessions = await this.sessionsService.revokeAllSessions(
      event.userId,
      undefined,
      event.reason
    )

    this.logger.info(
      { userId: event.userId, resetBy: event.resetBy, revokedSessions },
      'Revoked sessions after credentials reset'
    )
  }

  @OnDomainEvent(UserAccessSuspendedEvent)
  async revokeSessionsOfSuspendedUser(event: UserAccessSuspendedEvent): Promise<void> {
    const revokedSessions = await this.sessionsService.revokeAllSessions(
      event.userId,
      undefined,
      event.reason
    )
    this.logger.info(
      { userId: event.userId, suspendedBy: event.suspendedBy, revokedSessions },
      'Revoked sessions of a locked or deactivated user'
    )
  }
}
