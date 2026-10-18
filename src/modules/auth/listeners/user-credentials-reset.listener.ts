import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { UserCredentialsResetEvent } from '@modules/users'

import { OnDomainEvent } from '@core/events'

import { SessionsService } from '../services/sessions.service'

/** Forces re-login after an administrator resets a user's password */
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
}
