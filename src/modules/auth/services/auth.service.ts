import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common'
import { errorMessage } from '@shared/utils/error.util'
import { createHash } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { UsersService } from '@modules/users'
import { User } from '@modules/users/entities'

import { MetricsService } from '@core/observability/metrics.service'
import { PasswordHasher, verifyTokenSecret } from '@core/security'
import { SentryService } from '@core/sentry'

import type { SessionContext } from '../types/session-context'

import { AccessTokenService } from './access-token.service'
import { AccountLockoutService } from './account-lockout.service'
import { SessionsService } from './sessions.service'
import { TokenBlacklistService } from './token-blacklist.service'

function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16)
}

type AccountLockInfo = Awaited<ReturnType<AccountLockoutService['getAccountLockInfo']>>

/**
 * Sign-in and the session lifecycle it starts: credential checks (with lockout),
 * login, refresh-token rotation and logout.
 *
 * Related: PasswordChangeService (self-service password change)
 * (listing a user's sessions), AccessTokenService (JWT issuing).
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

  async validateUser(email: string, password: string, context?: SessionContext): Promise<User> {
    // Bypass cache to ensure we get User entity with methods (not plain object from cache)
    const user = await this.usersService.findByEmail(email, true)
    if (!user) {
      // Spend the same hashing time as a wrong password, so response timing does not
      // reveal which emails are registered
      await this.passwordHasher.verify(password, null)
      this.recordFailedLogin('user_not_found', { emailHash: hashEmail(email) }, context)
      throw new UnauthorizedException('Invalid credentials')
    }

    // Check if account is locked
    const isLocked = await this.accountLockoutService.isAccountLocked(user.id)
    if (isLocked) {
      const lockInfo = await this.accountLockoutService.getAccountLockInfo(user.id)
      this.recordFailedLogin(
        'account_locked',
        { userId: user.id, lockedUntil: lockInfo.lockedUntil },
        context
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
      this.recordFailedLogin(
        'invalid_password',
        { userId: user.id, failedAttempts: lockInfo.failedAttempts },
        context
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

      throw new UnauthorizedException('Invalid credentials')
    }

    if (!user.isActive) {
      this.recordFailedLogin('user_inactive', { userId: user.id }, context)
      throw new UnauthorizedException('User is inactive')
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
  private recordFailedLogin(
    reason: 'user_not_found' | 'invalid_password' | 'account_locked' | 'user_inactive',
    details: Record<string, unknown>,
    context?: SessionContext
  ): void {
    this.metricsService.incrementFailedLogin(reason)
    this.logger.warn(
      { action: 'login_failed', reason, ipAddress: context?.ipAddress, ...details },
      'Login failed'
    )
  }

  async login(user: User, context: SessionContext = {}) {
    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        ipAddress: context.ipAddress,
        deviceType: context.deviceType,
        action: 'user_login'
      },
      'User login'
    )

    // Check if user must change password
    if (user.forcePasswordChange) {
      this.logger.warn(
        { userId: user.id, email: user.email, action: 'password_change_required' },
        'User must change password before accessing system'
      )

      // Return special response indicating password change is required
      // Do NOT create session until password is changed
      return {
        requiresPasswordChange: true,
        userId: user.id,
        message:
          'Password change required. Please change your password before accessing the system.',
        tempAccessToken: await this.accessTokenService.issuePasswordChangeToken(user) // Limited token for password change only
      }
    }

    // Create session using SessionsService
    const { session, refreshToken } = await this.sessionsService.createSession({
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      deviceType: context.deviceType,
      sessionType: 'standard'
    })

    // Generate access token
    const accessToken = await this.accessTokenService.issueForSession(user, session.id)

    this.logger.info(
      { sessionId: session.id, userId: user.id, action: 'session_created' },
      'Session created for user'
    )

    // Metric: Log successful login
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

  async refresh(refreshToken: string, context: SessionContext) {
    const [tokenId, tokenSecret] = refreshToken.split('.')
    if (!tokenId || !tokenSecret) {
      throw new UnauthorizedException('Invalid refresh token format')
    }

    // Validate session exists and is active
    const validationResult = await this.sessionsService.validateSession(tokenId)
    if (!validationResult.valid || !validationResult.session) {
      throw new UnauthorizedException(validationResult.reason || 'Invalid session')
    }

    const session = validationResult.session

    // Verify refresh token secret
    const isValid = await verifyTokenSecret(tokenSecret, session.refreshTokenHash)
    if (!isValid) {
      await this.sessionsService.revokeSession(tokenId, 'invalid_token_secret')
      throw new UnauthorizedException('Invalid refresh token')
    }

    // Verify user is still active
    const user = await this.usersService.findById(session.userId)
    if (!user || !user.isActive) {
      await this.sessionsService.revokeSession(tokenId, 'user_inactive')
      throw new UnauthorizedException('User unavailable')
    }

    // Refresh session (creates new session, revokes old one)
    const { session: newSession, refreshToken: newRefreshToken } =
      await this.sessionsService.refreshSession(tokenId, {
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        deviceType: context.deviceType
      })

    // Generate new access token
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
      throw new UnauthorizedException('Invalid refresh token format')
    }

    // Validate session
    const validationResult = await this.sessionsService.validateSession(tokenId)
    if (!validationResult.valid || !validationResult.session) {
      throw new UnauthorizedException(validationResult.reason || 'Invalid session')
    }

    const session = validationResult.session

    // Verify ownership
    if (session.userId !== userId) {
      throw new UnauthorizedException('Session does not belong to user')
    }

    // Verify refresh token secret
    const isValid = await verifyTokenSecret(tokenSecret, session.refreshTokenHash)
    if (!isValid) {
      await this.sessionsService.revokeSession(tokenId, 'invalid_token_secret')
      throw new UnauthorizedException('Invalid refresh token')
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
