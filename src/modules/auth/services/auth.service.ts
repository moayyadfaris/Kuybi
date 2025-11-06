import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import type { StringValue } from 'ms'
import * as bcrypt from 'bcrypt'
import { SentryService } from '@core/sentry'
import { UsersService } from '@modules/users/services/users.service'
import { User } from '@modules/users/entities/user.entity'
import { Session } from '../entities/session.entity'
import { SessionsService } from './sessions.service'
import { TokenBlacklistService } from './token-blacklist.service'
import { AccountLockoutService } from './account-lockout.service'
import { PasswordHistoryRepository } from '../repositories/password-history.repository'
import { PasswordStrengthService } from './password-strength.service'
import { EmailService } from '@infrastructure/email/services/email.service'

interface SessionContext {
  ipAddress?: string
  userAgent?: string
  deviceType?: string
}

interface ListSessionsOptions {
  page: number
  limit: number
  includeExpired: boolean
  sortBy?: 'createdAt' | 'expiresAt' | 'ipAddress'
  sortOrder?: 'asc' | 'desc'
  filterByDevice?: string
  filterByStatus?: 'active' | 'expired' | 'expiring'
  includeRiskAssessment: boolean
  anonymizeData: boolean
}

@Injectable()
export class AuthService {
  constructor(
    @InjectPinoLogger(AuthService.name)
    private readonly logger: PinoLogger,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly sessionsService: SessionsService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly accountLockoutService: AccountLockoutService,
    private readonly sentryService: SentryService,
    private readonly passwordHistoryRepository: PasswordHistoryRepository,
    private readonly passwordStrengthService: PasswordStrengthService,
    private readonly emailService: EmailService
  ) {}

  async validateUser(email: string, password: string, context?: SessionContext): Promise<User> {
    const user = await this.usersService.findByEmail(email)
    if (!user) {
      // Capture failed login attempts to Sentry for security monitoring
      this.sentryService.captureMessage(`Failed login attempt for email: ${email}`, 'warning', {
        email,
        reason: 'user_not_found'
      })
      throw new UnauthorizedException('Invalid credentials')
    }

    // Check if account is locked
    const isLocked = await this.accountLockoutService.isAccountLocked(user.id)
    if (isLocked) {
      const lockInfo = await this.accountLockoutService.getAccountLockInfo(user.id)

      // Log lockout attempt to Sentry
      this.sentryService.captureMessage(`Locked account login attempt: ${user.id}`, 'warning', {
        userId: user.id,
        email: user.email,
        reason: 'account_locked',
        lockedUntil: lockInfo.lockedUntil,
        failedAttempts: lockInfo.failedAttempts
      })

      // Calculate unlock time in seconds
      const unlockInSeconds = lockInfo.lockedUntil
        ? Math.max(0, Math.floor((new Date(lockInfo.lockedUntil).getTime() - Date.now()) / 1000))
        : 0

      console.log('Account is locked, throwing 423 Locked exception')
      // Return 423 Locked with detailed information
      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED,
          message: `Account has been locked due to too many failed attempts. It will be unlocked at ${new Date(lockInfo.lockedUntil).toISOString()}.`,
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

    const passwordValid = await bcrypt.compare(password, user.passwordHash)
    if (!passwordValid) {
      // Record failed attempt and potentially lock account
      await this.accountLockoutService.recordFailedAttempt(user.id, context?.ipAddress)

      // Get updated lock info to check if account was just locked
      const lockInfo = await this.accountLockoutService.getAccountLockInfo(user.id)

      // Capture invalid password attempts to Sentry
      this.sentryService.captureMessage(
        `Invalid password attempt for user: ${user.id}`,
        'warning',
        {
          userId: user.id,
          email: user.email,
          reason: 'invalid_password',
          failedAttempts: lockInfo.failedAttempts,
          accountLocked: lockInfo.isLocked
        }
      )

      // If account was just locked, inform user with 423 Locked
      if (lockInfo.isLocked) {
        const unlockInSeconds = lockInfo.lockedUntil
          ? Math.max(0, Math.floor((new Date(lockInfo.lockedUntil).getTime() - Date.now()) / 1000))
          : 0

        throw new HttpException(
          {
            statusCode: HttpStatus.LOCKED,
            message: `Account has been locked due to too many failed attempts. It will be unlocked at ${new Date(lockInfo.lockedUntil).toISOString()}.`,
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

      throw new UnauthorizedException('Invalid credentials')
    }

    if (!user.isActive) {
      // Capture inactive user login attempts
      this.sentryService.captureMessage(`Inactive user login attempt: ${user.id}`, 'warning', {
        userId: user.id,
        email: user.email,
        reason: 'user_inactive'
      })
      throw new UnauthorizedException('User is inactive')
    }

    // Successful login - reset failed attempts counter
    await this.accountLockoutService.resetFailedAttempts(user.id)

    return user
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
        tempAccessToken: await this.generateTempAccessToken(user) // Limited token for password change only
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
    const accessToken = await this.generateAccessToken(user)

    this.logger.info(
      { sessionId: session.id, userId: user.id, action: 'session_created' },
      'Session created for user'
    )

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
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
    const isValid = await bcrypt.compare(tokenSecret, session.refreshTokenHash)
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
    const accessToken = await this.generateAccessToken(user)

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
    const isValid = await bcrypt.compare(tokenSecret, session.refreshTokenHash)
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
            error: error.message,
            action: 'access_token_blacklist_failed'
          },
          'Failed to blacklist access token (non-critical)'
        )
      }
    }

    // Perform logout
    let sessionsInvalidated = 0
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

  async listSessions(userId: string, options: ListSessionsOptions) {
    // Get sessions using SessionsService
    const allSessions = await this.sessionsService.getActiveSessions(userId, options.includeExpired)
    const normalizedSessions = allSessions.map(session => this.normalizeSessionDates(session))

    // Apply filters
    let filtered = normalizedSessions

    if (options.filterByDevice) {
      filtered = filtered.filter(
        s => s.deviceType?.toLowerCase() === options.filterByDevice?.toLowerCase()
      )
    }

    if (options.filterByStatus) {
      const now = Date.now()
      if (options.filterByStatus === 'active') {
        filtered = filtered.filter(s => s.expiresAt.getTime() > now && s.isActive)
      } else if (options.filterByStatus === 'expired') {
        filtered = filtered.filter(s => s.expiresAt.getTime() <= now || !s.isActive)
      } else if (options.filterByStatus === 'expiring') {
        const threshold = now + 24 * 60 * 60 * 1000
        filtered = filtered.filter(s => {
          const expiresTime = s.expiresAt.getTime()
          return expiresTime > now && expiresTime <= threshold
        })
      }
    }

    // Apply sorting
    if (options.sortBy) {
      const sortField = options.sortBy
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1
      filtered.sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]
        if (aVal instanceof Date && bVal instanceof Date) {
          return (aVal.getTime() - bVal.getTime()) * sortOrder
        }
        return String(aVal).localeCompare(String(bVal)) * sortOrder
      })
    } else {
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }

    // Apply pagination
    const total = filtered.length
    const start = options.page * options.limit
    const paginated = filtered.slice(start, start + options.limit)

    // Map to response format
    const now = Date.now()
    const mapped = await Promise.all(
      paginated.map(async session => {
        const isExpired = session.expiresAt.getTime() <= now
        let risk

        if (options.includeRiskAssessment) {
          try {
            const assessment = await this.sessionsService.assessSessionRisk(session.id)
            risk = { level: assessment.riskLevel, reason: assessment.factors.join(', ') }
          } catch {
            risk = this.evaluateSessionRisk(session, isExpired)
          }
        }

        return {
          id: session.id,
          deviceType: session.deviceType,
          userAgent: session.userAgent,
          ipAddress: options.anonymizeData
            ? this.anonymizeIp(session.ipAddress)
            : session.ipAddress,
          lastActivityAt: session.lastActivityAt,
          expiresAt: session.expiresAt,
          createdAt: session.createdAt,
          status: isExpired ? 'expired' : 'active',
          securityLevel: session.securityLevel,
          sessionType: session.sessionType,
          fingerprint: session.fingerprint,
          risk
        }
      })
    )

    return {
      total,
      page: options.page,
      limit: options.limit,
      sessions: mapped
    }
  }

  private normalizeSessionDates(session: Session): Session {
    session.createdAt = this.ensureDate(session.createdAt)
    session.updatedAt = this.ensureDate(session.updatedAt)
    session.lastActivityAt = this.ensureDate(session.lastActivityAt)
    session.expiresAt = this.ensureDate(session.expiresAt)
    session.deletedAt = session.deletedAt ? this.ensureDate(session.deletedAt) : undefined
    return session
  }

  private ensureDate(value?: Date | string | number | null): Date {
    if (value instanceof Date) {
      return value
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed
      }
    }

    return new Date(0)
  }

  private evaluateSessionRisk(session: Session, isExpired: boolean) {
    if (isExpired) {
      return { level: 'low', reason: 'Session already expired' }
    }

    const hoursUntilExpiry = (session.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntilExpiry < 1) {
      return { level: 'high', reason: 'Session expires in under an hour' }
    }

    if (hoursUntilExpiry < 24) {
      return { level: 'medium', reason: 'Session expires within 24 hours' }
    }

    return { level: 'low', reason: 'Session appears healthy' }
  }

  private anonymizeIp(ip?: string | null) {
    if (!ip) return ip
    if (ip.includes(':')) {
      const parts = ip.split(':')
      return `${parts.slice(0, 4).join(':')}::` // basic IPv6 masking
    }
    const segments = ip.split('.')
    if (segments.length !== 4) return ip
    return `${segments[0]}.${segments[1]}.***.***`
  }

  private async generateAccessToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role }
    return this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('auth.jwtAccessExpiresIn') as StringValue
    })
  }

  /**
   * Generate temporary access token for password change only
   * This token is valid for 15 minutes and can only be used to change password
   */
  private async generateTempAccessToken(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tempPasswordChange: true // Flag to identify this is a temp token
    }
    return this.jwtService.signAsync(payload, {
      expiresIn: '15m' // Short expiry for security
    })
  }

  /**
   * Change password for user
   * Validates current password, sets new password, and optionally invalidates sessions
   *
   * @param userId - User ID
   * @param currentPassword - Current password for verification
   * @param newPassword - New password to set
   * @param confirmPassword - Password confirmation
   * @param options - Additional options for password change behavior
   * @param context - Session context (IP, user agent, etc.)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
    options: {
      invalidateAllSessions?: boolean
      sendNotificationEmail?: boolean
      currentSessionId?: string // To keep current session active
    },
    context: SessionContext
  ) {
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      throw new UnauthorizedException('New password and confirmation do not match')
    }

    // Get user
    const user = await this.usersService.findById(userId)
    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    // Verify current password
    const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect')
    }

    // Prevent reusing the same password
    const samePassword = await bcrypt.compare(newPassword, user.passwordHash)
    if (samePassword) {
      throw new UnauthorizedException('New password must be different from current password')
    }

    // Check password strength
    const strengthResult = await this.passwordStrengthService.calculateStrength(newPassword)
    if (!strengthResult.passed) {
      throw new UnauthorizedException({
        message: 'Password does not meet strength requirements',
        errors: strengthResult.feedback,
        strength: strengthResult.strength,
        score: strengthResult.score
      })
    }

    // Check password change cooldown (temporary lockout)
    const cooldownHours = this.configService.get<number>('auth.passwordChangeCooldownHours', 1)
    if (cooldownHours > 0) {
      const latestChange = await this.passwordHistoryRepository.findByUser(userId, 1)
      if (latestChange.length > 0) {
        const lastChangeDate = latestChange[0].createdAt
        const hoursSinceChange =
          (Date.now() - new Date(lastChangeDate).getTime()) / (1000 * 60 * 60)

        if (hoursSinceChange < cooldownHours) {
          const remainingHours = Math.ceil(cooldownHours - hoursSinceChange)
          const remainingMinutes = Math.ceil((cooldownHours - hoursSinceChange) * 60)

          throw new UnauthorizedException({
            message: 'Password was changed too recently',
            code: 'PASSWORD_CHANGE_COOLDOWN',
            cooldownHours,
            remainingTime:
              remainingHours >= 1
                ? `${remainingHours} hour${remainingHours > 1 ? 's' : ''}`
                : `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`,
            lastChangedAt: lastChangeDate,
            canChangeAfter: new Date(
              new Date(lastChangeDate).getTime() + cooldownHours * 60 * 60 * 1000
            )
          })
        }

        this.logger.info(
          {
            userId,
            hoursSinceChange: hoursSinceChange.toFixed(2),
            cooldownHours,
            action: 'password_cooldown_check_passed'
          },
          'Password change cooldown check passed'
        )
      }
    }

    // Check password history (last 5 passwords)
    const passwordHistory = await this.passwordHistoryRepository.findByUser(userId, 5)
    for (const historyEntry of passwordHistory) {
      const isReused = await bcrypt.compare(newPassword, historyEntry.passwordHash)
      if (isReused) {
        throw new UnauthorizedException(
          'Password has been used recently. Please choose a different password.'
        )
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(newPassword, salt)

    // Update user password and clear forcePasswordChange flag
    user.passwordHash = passwordHash
    user.forcePasswordChange = false
    await this.usersService.updateUser(user.id, {
      passwordHash,
      forcePasswordChange: false
    })

    // Save password to history
    await this.passwordHistoryRepository.addPasswordHistory(
      userId,
      passwordHash,
      context.ipAddress,
      context.userAgent,
      5 // Keep last 5 passwords
    )

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        ipAddress: context.ipAddress,
        action: 'password_changed',
        invalidateAllSessions: options.invalidateAllSessions,
        sendNotification: options.sendNotificationEmail,
        passwordStrength: strengthResult.strength
      },
      'User changed password successfully'
    )

    // Handle session invalidation based on user preference
    const invalidateAllSessions = options.invalidateAllSessions !== false // Default to true
    const sessionsRevoked = {
      count: 0,
      exceptCurrent: false
    }

    if (invalidateAllSessions) {
      // Invalidate all sessions EXCEPT current one (if provided)
      const revokedCount = await this.sessionsService.revokeAllSessions(
        userId,
        options.currentSessionId, // Exempt current session
        'Password changed by user'
      )

      sessionsRevoked.count = revokedCount
      sessionsRevoked.exceptCurrent = !!options.currentSessionId

      this.logger.info(
        {
          userId: user.id,
          sessionsRevoked: revokedCount,
          exceptCurrent: sessionsRevoked.exceptCurrent,
          action: 'sessions_revoked_after_password_change'
        },
        `Revoked ${revokedCount} sessions after password change`
      )
    } else {
      this.logger.info(
        { userId: user.id, action: 'password_changed_sessions_kept' },
        'Password changed, sessions kept active per user request'
      )
    }

    // Send notification email if requested
    if (options.sendNotificationEmail !== false) {
      try {
        await this.emailService.sendPasswordChangedEmail(
          user.email,
          user.name,
          new Date(),
          context.ipAddress
        )

        this.logger.info(
          {
            userId: user.id,
            email: user.email,
            action: 'password_change_notification_sent',
            sessionsRevoked: sessionsRevoked.count
          },
          'Password change notification email sent successfully'
        )
      } catch (error) {
        // Log error but don't fail the password change
        this.logger.error(
          {
            userId: user.id,
            email: user.email,
            error: error.message,
            action: 'password_change_notification_failed'
          },
          'Failed to send password change notification email'
        )

        // Capture to Sentry for monitoring
        this.sentryService.captureException(error, {
          userId: user.id,
          email: user.email,
          context: 'password_change_notification'
        })
      }
    }

    return {
      message: invalidateAllSessions
        ? sessionsRevoked.exceptCurrent
          ? 'Password changed successfully. Other sessions have been logged out.'
          : 'Password changed successfully. Please login with your new password.'
        : 'Password changed successfully. All sessions remain active.',
      success: true,
      sessionsRevoked: sessionsRevoked.count,
      notificationSent: options.sendNotificationEmail !== false
    }
  }
}
