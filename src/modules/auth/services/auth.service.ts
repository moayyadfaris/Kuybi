import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common'
import { ErrorCode } from '@shared/errors'
import { errorMessage } from '@shared/utils/error.util'
import { createHash } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { UsersService } from '@modules/users'
import { User } from '@modules/users/entities'

import { MetricsService } from '@core/observability/metrics.service'
import { PasswordHasher, verifyTokenSecret } from '@core/security'
import { SentryService } from '@core/sentry'

import type { LoginFailure } from '../types/login-failure'
import type { SessionContext } from '../types/session-context'

import { AccessTokenService } from './access-token.service'
import { AccountLockoutService } from './account-lockout.service'
import { SessionsService } from './sessions.service'
import { TokenBlacklistService } from './token-blacklist.service'

const INVALID_CREDENTIALS = {
  code: ErrorCode.AUTH_INVALID_CREDENTIALS,
  message: 'Invalid credentials'
}

const refreshTokenInvalid = (message: string) => ({
  code: ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
  message
})

function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16)
}

type AccountLockInfo = Awaited<ReturnType<AccountLockoutService['getAccountLockInfo']>>

/**
 * Sign-in and the session lifecycle it starts: credential checks (with lockout), login,
 * refresh-token rotation and logout.
 *
 * Related: SessionsService (sessions behind refresh tokens), AccessTokenService (JWTs),
 * PasswordChangeService (self-service password change).
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectPinoLogger(AuthService.name)
    private readonly logger: PinoLogger,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly accountLockoutService: AccountLockoutService,
    private readonly accessTokenService: AccessTokenService,
    private readonly sentryService: SentryService,
    private readonly metricsService: MetricsService,
    private readonly passwordHasher: PasswordHasher
  ) {}

  /**
   * The user these credentials belong to. Every refusal is logged, counted and reported to
   * `onFailure` (the login route records it in the audit trail) before it is thrown.
   */
  async validateUser(
    email: string,
    password: string,
    context?: SessionContext,
    onFailure?: (failure: LoginFailure) => Promise<unknown>
  ): Promise<User> {
    // Bypass cache to ensure we get User entity with methods (not plain object from cache)
    const user = await this.usersService.findByEmail(email, true)
    if (!user) {
      // Spend the same hashing time as a wrong password, so response timing does not
      // reveal which emails are registered
      await this.passwordHasher.verify(password, null)
      await this.recordFailedLogin(
        { reason: 'user_not_found' },
        { emailHash: hashEmail(email) },
        context,
        onFailure
      )
      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }

    // Checked before the password, so a locked account cannot be probed further. Known
    // trade-off: only existing accounts lock, so a 423 tells the caller the email exists.
    const isLocked = await this.accountLockoutService.isAccountLocked(user.id)
    if (isLocked) {
      const lockInfo = await this.accountLockoutService.getAccountLockInfo(user.id)
      await this.recordFailedLogin(
        { reason: 'account_locked', user },
        { userId: user.id, lockedUntil: lockInfo.lockedUntil },
        context,
        onFailure
      )
      throw accountLockedException(lockInfo)
    }

    const passwordHash = await this.usersService.getPasswordHash(user.id)
    const passwordValid = await this.passwordHasher.verify(password, passwordHash)
    if (!passwordValid) {
      // Record failed attempt and potentially lock account
      await this.accountLockoutService.recordFailedAttempt(user.id, context?.ipAddress)

      // Get updated lock info to check if account was just locked
      const lockInfo = await this.accountLockoutService.getAccountLockInfo(user.id)
      await this.recordFailedLogin(
        { reason: 'invalid_password', user },
        { userId: user.id, failedAttempts: lockInfo.failedAttempts },
        context,
        onFailure
      )

      // If account was just locked, inform user with 423 Locked
      if (lockInfo.isLocked) {
        // A lockout is rare and worth an alert; individual failures are only logged
        this.sentryService.captureMessage('Account locked after failed logins', 'warning', {
          userId: user.id,
          failedAttempts: lockInfo.failedAttempts,
          lockedUntil: lockInfo.lockedUntil
        })
        throw accountLockedException(lockInfo)
      }

      throw new UnauthorizedException(INVALID_CREDENTIALS)
    }

    if (!user.isActive) {
      await this.recordFailedLogin(
        { reason: 'user_inactive', user },
        { userId: user.id },
        context,
        onFailure
      )
      throw new UnauthorizedException({
        code: ErrorCode.AUTH_ACCOUNT_INACTIVE,
        message: 'User is inactive'
      })
    }

    // Successful login - reset failed attempts counter
    await this.accountLockoutService.resetFailedAttempts(user.id)
    await this.upgradePasswordHash(user.id, password, passwordHash)

    return user
  }

  /**
   * Re-hashes a password stored at a lower cost than configured, while the plain password
   * is at hand (the only moment it is). Best effort: a failure must not block the login.
   */
  private async upgradePasswordHash(
    userId: string,
    password: string,
    passwordHash: string | null | undefined
  ): Promise<void> {
    if (!passwordHash || !this.passwordHasher.needsRehash(passwordHash)) return
    try {
      await this.usersService.storePasswordHash(userId, await this.passwordHasher.hash(password))
      this.logger.info({ userId, rounds: this.passwordHasher.rounds }, 'Password hash upgraded')
    } catch (error) {
      this.logger.warn({ userId, error: errorMessage(error) }, 'Password hash upgrade failed')
    }
  }

  /**
   * Failed logins are logged and counted, not sent to Sentry: anyone can trigger them, so
   * they would exhaust the quota, and the submitted email is personal data (logged only
   * as a hash, which still lets attempts on one address be correlated).
   */
  private async recordFailedLogin(
    failure: LoginFailure,
    details: Record<string, unknown>,
    context?: SessionContext,
    onFailure?: (failure: LoginFailure) => Promise<unknown>
  ): Promise<void> {
    const { reason } = failure
    this.metricsService.incrementFailedLogin(reason)
    this.logger.warn(
      { action: 'login_failed', reason, ipAddress: context?.ipAddress, ...details },
      'Login failed'
    )
    await onFailure?.(failure)
  }

  /**
   * Starts a session for a user whose credentials were checked (validateUser). A user who
   * must change their password gets no session, only a token limited to the
   * password-change endpoints.
   */
  async login(user: User, context: SessionContext = {}) {
    // Logged by id only: the email is personal data (see recordFailedLogin)
    this.logger.info(
      {
        userId: user.id,
        ipAddress: context.ipAddress,
        deviceType: context.deviceType,
        action: 'user_login'
      },
      'User login'
    )

    if (user.forcePasswordChange) {
      this.logger.warn(
        { userId: user.id, action: 'password_change_required' },
        'User must change password before accessing system'
      )
      return {
        requiresPasswordChange: true,
        userId: user.id,
        message:
          'Password change required. Please change your password before accessing the system.',
        tempAccessToken: await this.accessTokenService.issuePasswordChangeToken(user)
      }
    }

    const { session, refreshToken } = await this.sessionsService.createSession({
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      deviceType: context.deviceType,
      sessionType: 'standard'
    })

    const accessToken = await this.accessTokenService.issueForSession(user, session.id)
    this.metricsService.incrementUserLogin(user.getPrimaryRoleName())

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.getPrimaryRoleName()
      }
    }
  }

  /**
   * Rotates a refresh token: checks its secret, revokes its session and starts a new one.
   * A wrong secret revokes the session (the token may have leaked).
   */
  async refresh(refreshToken: string, context: SessionContext) {
    const [tokenId, tokenSecret] = refreshToken.split('.')
    if (!tokenId || !tokenSecret) {
      throw new UnauthorizedException(refreshTokenInvalid('Invalid refresh token format'))
    }

    // Validate session exists and is active
    const validationResult = await this.sessionsService.validateSession(tokenId)
    if (!validationResult.valid || !validationResult.session) {
      throw new UnauthorizedException(
        refreshTokenInvalid(validationResult.reason || 'Invalid session')
      )
    }

    const session = validationResult.session

    // Verify refresh token secret
    const isValid = await verifyTokenSecret(tokenSecret, session.refreshTokenHash)
    if (!isValid) {
      await this.sessionsService.revokeSession(tokenId, 'invalid_token_secret')
      throw new UnauthorizedException(refreshTokenInvalid('Invalid refresh token'))
    }

    // Verify user is still active
    const user = await this.usersService.findById(session.userId)
    if (!user || !user.isActive) {
      await this.sessionsService.revokeSession(tokenId, 'user_inactive')
      throw new UnauthorizedException(refreshTokenInvalid('User unavailable'))
    }
    // Created before the password was reset (by email or by an admin): void
    if (user.credentialsChangedAt && session.createdAt < user.credentialsChangedAt) {
      await this.sessionsService.revokeSession(tokenId, 'credentials_changed')
      throw new UnauthorizedException(refreshTokenInvalid('The password was reset'))
    }

    const { session: newSession, refreshToken: newRefreshToken } =
      await this.sessionsService.refreshSession(tokenId, {
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        deviceType: context.deviceType
      })

    const accessToken = await this.accessTokenService.issueForSession(user, newSession.id)

    this.logger.info(
      {
        oldSessionId: tokenId,
        newSessionId: newSession.id,
        userId: user.id,
        action: 'session_refreshed'
      },
      'Session refreshed'
    )

    return {
      accessToken,
      refreshToken: newRefreshToken
    }
  }

  /**
   * Ends the session of the given refresh token (or every session of the user with
   * `logoutAll`) and blacklists the presented access token, so it stops working before it
   * expires. The refresh token must belong to the caller.
   */
  async logout(
    refreshToken: string,
    options: SessionContext & {
      userId: string
      logoutAll?: boolean
      reason?: string
      accessToken?: string
    }
  ) {
    const { userId, logoutAll = false, reason, accessToken } = options
    const [tokenId, tokenSecret] = refreshToken.split('.')

    if (!tokenId || !tokenSecret) {
      throw new UnauthorizedException(refreshTokenInvalid('Invalid refresh token format'))
    }

    // Validate session
    const validationResult = await this.sessionsService.validateSession(tokenId)
    if (!validationResult.valid || !validationResult.session) {
      throw new UnauthorizedException(
        refreshTokenInvalid(validationResult.reason || 'Invalid session')
      )
    }

    const session = validationResult.session

    // Verify ownership
    if (session.userId !== userId) {
      throw new UnauthorizedException(refreshTokenInvalid('Session does not belong to user'))
    }

    // Verify refresh token secret
    const isValid = await verifyTokenSecret(tokenSecret, session.refreshTokenHash)
    if (!isValid) {
      await this.sessionsService.revokeSession(tokenId, 'invalid_token_secret')
      throw new UnauthorizedException(refreshTokenInvalid('Invalid refresh token'))
    }

    // Blacklist the current access token immediately (if provided)
    let tokenBlacklisted = false
    if (accessToken) {
      try {
        const result = await this.tokenBlacklistService.blacklistToken(accessToken, {
          userId,
          sessionId: session.id,
          reason: reason || (logoutAll ? 'user_logout_all' : 'user_logout')
        })
        tokenBlacklisted = result.success
        this.logger.info(
          {
            userId,
            sessionId: session.id,
            tokenHash: result.tokenHash.substring(0, 16),
            action: 'access_token_blacklisted'
          },
          'Access token blacklisted on logout'
        )
      } catch (error) {
        this.logger.warn(
          {
            userId,
            sessionId: session.id,
            error: errorMessage(error),
            action: 'access_token_blacklist_failed'
          },
          'Failed to blacklist access token (non-critical)'
        )
      }
    }

    // Perform logout
    let sessionsInvalidated: number
    if (logoutAll) {
      sessionsInvalidated = await this.sessionsService.revokeAllSessions(
        userId,
        undefined, // Don't exclude any session
        reason || 'user_logout_all'
      )
      this.logger.info(
        {
          userId,
          sessionsInvalidated,
          reason: reason || 'user_logout_all',
          action: 'logout_all_devices'
        },
        'User logged out from all devices'
      )
    } else {
      const success = await this.sessionsService.revokeSession(tokenId, reason || 'user_logout')
      sessionsInvalidated = success ? 1 : 0
      this.logger.info(
        { userId, sessionId: tokenId, reason: reason || 'user_logout', action: 'logout_session' },
        'User logged out from session'
      )
    }

    return {
      sessionsInvalidated,
      logoutType: logoutAll ? 'all_devices' : 'current_device',
      sessionId: session.id,
      cacheCleared: true, // SessionsService handles cache invalidation
      tokenBlacklisted // Indicates if access token was blacklisted
    }
  }
}

/** 423 Locked with the details clients need to show when the account unlocks */
function accountLockedException(lockInfo: AccountLockInfo): HttpException {
  const unlockInSeconds = lockInfo.lockedUntil
    ? Math.max(0, Math.floor((new Date(lockInfo.lockedUntil).getTime() - Date.now()) / 1000))
    : 0

  return new HttpException(
    {
      statusCode: HttpStatus.LOCKED,
      code: ErrorCode.AUTH_ACCOUNT_LOCKED,
      message: `Account has been locked due to too many failed attempts. ${lockInfo.lockedUntil ? `It will be unlocked at ${new Date(lockInfo.lockedUntil).toISOString()}.` : 'Contact an administrator to unlock it.'}`,
      error: 'Locked',
      details: {
        lockedAt: lockInfo.lockedAt,
        lockedUntil: lockInfo.lockedUntil,
        unlockIn: unlockInSeconds,
        failedAttempts: lockInfo.failedAttempts,
        maxAttempts: lockInfo.maxAttempts,
        lockReason: lockInfo.lockReason
      }
    },
    HttpStatus.LOCKED
  )
}
