import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { CacheService } from '@core/cache/services/cache.service'

/** What is stored for a revoked access token */
interface BlacklistEntry {
  userId?: string
  sessionId?: string
  reason?: string
  blacklistedAt: string
}

/** Kept when a token carries no `exp` (ours always do): the access token lifetime cap */
const FALLBACK_TTL_SECONDS = 15 * 60

/**
 * Access tokens revoked before they expire (logout). Access tokens die with their
 * session already (JwtStrategy checks it); the blacklist rejects the presented token
 * even before that check, and covers tokens without a session.
 *
 * Stored in the cache as `token:blacklist:<sha256 of the token>` (never the token
 * itself), until the token would have expired anyway.
 */
@Injectable()
export class TokenBlacklistService {
  private readonly BLACKLIST_PREFIX = 'token:blacklist'

  constructor(
    @InjectPinoLogger(TokenBlacklistService.name)
    private readonly logger: PinoLogger,
    private readonly cacheService: CacheService
  ) {}

  /**
   * Rejects the token from now until it expires. An already expired token is skipped
   * (it is rejected anyway).
   * @returns the token's hash, for correlating log lines
   */
  async blacklistToken(
    token: string,
    options: { userId?: string; sessionId?: string; reason?: string } = {}
  ): Promise<{ success: boolean; tokenHash: string }> {
    const { userId, sessionId, reason = 'logout' } = options
    const tokenHash = sha256(token)
    const ttl = secondsUntilExpiry(token)

    if (ttl <= 0) {
      return { success: true, tokenHash }
    }

    const entry: BlacklistEntry = {
      userId,
      sessionId,
      reason,
      blacklistedAt: new Date().toISOString()
    }
    await this.cacheService.set(this.key(tokenHash), entry, ttl)

    this.logger.info(
      {
        tokenHash: tokenHash.slice(0, 16),
        userId,
        sessionId,
        reason,
        ttl,
        action: 'token_blacklisted'
      },
      'Access token blacklisted'
    )
    return { success: true, tokenHash }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    return !!(await this.cacheService.get<BlacklistEntry>(this.key(sha256(token))))
  }

  private key(tokenHash: string): string {
    return `${this.BLACKLIST_PREFIX}:${tokenHash}`
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Seconds until the JWT's `exp` (read without verifying: only the lifetime is needed) */
function secondsUntilExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString())
    if (typeof payload.exp === 'number') {
      return Math.max(0, Math.floor(payload.exp - Date.now() / 1000))
    }
  } catch {
    // Not a JWT we can read: keep it for the longest an access token lives
  }
  return FALLBACK_TTL_SECONDS
}
