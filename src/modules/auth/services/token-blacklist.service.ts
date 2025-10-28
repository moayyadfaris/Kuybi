import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { CacheService } from '@core/cache/services/cache.service'
import * as crypto from 'crypto'

/**
 * TokenBlacklistService - Manages access token invalidation via Redis
 * 
 * This service ensures that when users logout, their access tokens are immediately
 * invalidated, even though JWTs are stateless. This prevents the security issue
 * where logged-out users can continue using valid JWTs until expiration.
 * 
 * Features:
 * - Hash-based token storage (security)
 * - TTL-based automatic cleanup (performance)
 * - Structured logging (observability)
 * - Reason tracking (audit compliance)
 * - Batch operations (efficiency)
 * 
 * Redis Key Pattern: token:blacklist:{tokenHash}
 * TTL: Matches JWT expiration time (auto-cleanup)
 */
@Injectable()
export class TokenBlacklistService {
  private readonly BLACKLIST_PREFIX = 'token:blacklist'

  constructor(
    @InjectPinoLogger(TokenBlacklistService.name)
    private readonly logger: PinoLogger,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Blacklist an access token (invalidate it immediately)
   * 
   * @param token - The JWT access token to blacklist
   * @param options - Blacklist options
   * @returns Success status
   */
  async blacklistToken(
    token: string,
    options: {
      userId?: string
      sessionId?: string
      reason?: string
      expiresAt?: Date
    } = {}
  ): Promise<{ success: boolean; tokenHash: string }> {
    const { userId, sessionId, reason = 'logout', expiresAt } = options

    // Hash the token (never store raw tokens)
    const tokenHash = this.hashToken(token)
    const cacheKey = this.generateBlacklistKey(tokenHash)

    // Calculate TTL: until token naturally expires
    const ttl = this.calculateTTL(token, expiresAt)

    if (ttl <= 0) {
      // Token already expired, no need to blacklist
      this.logger.debug(
        {
          tokenHash: tokenHash.substring(0, 16),
          userId,
          sessionId,
          reason,
          action: 'blacklist_skip_expired'
        },
        'Skipping blacklist for expired token'
      )
      return { success: true, tokenHash }
    }

    // Store blacklist entry in Redis
    const blacklistData = {
      tokenHash,
      userId,
      sessionId,
      reason,
      blacklistedAt: new Date().toISOString(),
      expiresAt: expiresAt?.toISOString() || this.calculateExpirationDate(token)
    }

    await this.cacheService.set(cacheKey, blacklistData, ttl)

    this.logger.info(
      {
        tokenHash: tokenHash.substring(0, 16),
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

  /**
   * Blacklist multiple tokens at once (bulk logout)
   * 
   * @param tokens - Array of tokens to blacklist
   * @param options - Blacklist options
   * @returns Number of tokens blacklisted
   */
  async blacklistTokens(
    tokens: string[],
    options: {
      userId?: string
      reason?: string
    } = {}
  ): Promise<{ success: boolean; count: number; tokenHashes: string[] }> {
    const { userId, reason = 'logout_all' } = options
    const tokenHashes: string[] = []

    for (const token of tokens) {
      const result = await this.blacklistToken(token, {
        userId,
        reason
      })
      if (result.success) {
        tokenHashes.push(result.tokenHash)
      }
    }

    this.logger.info(
      {
        userId,
        reason,
        count: tokenHashes.length,
        total: tokens.length,
        action: 'tokens_bulk_blacklisted'
      },
      'Multiple tokens blacklisted'
    )

    return {
      success: true,
      count: tokenHashes.length,
      tokenHashes
    }
  }

  /**
   * Check if a token is blacklisted
   * 
   * @param token - The JWT access token to check
   * @returns True if blacklisted, false otherwise
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token)
    const cacheKey = this.generateBlacklistKey(tokenHash)
    
    const blacklistEntry = await this.cacheService.get<any>(cacheKey)
    const isBlacklisted = blacklistEntry && blacklistEntry !== null

    if (isBlacklisted) {
      this.logger.debug(
        {
          tokenHash: tokenHash.substring(0, 16),
          reason: blacklistEntry?.reason,
          blacklistedAt: blacklistEntry?.blacklistedAt,
          action: 'blacklist_check_hit'
        },
        'Token found in blacklist'
      )
    }

    return isBlacklisted
  }

  /**
   * Remove a token from blacklist (manual unblock - rare)
   * 
   * @param token - The token to unblacklist
   * @returns Success status
   */
  async removeFromBlacklist(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token)
    const cacheKey = this.generateBlacklistKey(tokenHash)

    await this.cacheService.del(cacheKey)

    this.logger.warn(
      {
        tokenHash: tokenHash.substring(0, 16),
        action: 'token_unblacklisted'
      },
      'Token removed from blacklist (manual operation)'
    )

    return true
  }

  /**
   * Get blacklist statistics
   * 
   * @returns Blacklist stats
   */
  async getBlacklistStats(): Promise<{
    estimatedCount: number
    prefix: string
    description: string
  }> {
    // Note: Redis doesn't provide efficient counting for key patterns
    // This is an estimate based on SCAN
    const pattern = `${this.BLACKLIST_PREFIX}:*`
    const keys = await this.scanBlacklistKeys()

    return {
      estimatedCount: keys.length,
      prefix: this.BLACKLIST_PREFIX,
      description: 'Tokens auto-expire based on JWT expiration time'
    }
  }

  /**
   * Clean up expired blacklist entries (usually automatic via TTL)
   * Manual cleanup for maintenance
   * 
   * @returns Number of entries cleaned
   */
  async cleanupExpiredEntries(): Promise<{ cleaned: number }> {
    const keys = await this.scanBlacklistKeys()
    let cleaned = 0

    for (const key of keys) {
      const entry = await this.cacheService.get<any>(key)
      if (!entry || this.isEntryExpired(entry)) {
        await this.cacheService.del(key)
        cleaned++
      }
    }

    this.logger.info(
      {
        cleaned,
        total: keys.length,
        action: 'blacklist_cleanup'
      },
      'Cleaned up expired blacklist entries'
    )

    return { cleaned }
  }

  // ========== Private Helper Methods ==========

  /**
   * Hash a token using SHA-256 (one-way, secure)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /**
   * Generate Redis key for blacklist entry
   */
  private generateBlacklistKey(tokenHash: string): string {
    return `${this.BLACKLIST_PREFIX}:${tokenHash}`
  }

  /**
   * Calculate TTL in seconds for blacklist entry
   * TTL = time until token naturally expires
   */
  private calculateTTL(token: string, expiresAt?: Date): number {
    if (expiresAt) {
      const ttlMs = expiresAt.getTime() - Date.now()
      return Math.max(0, Math.floor(ttlMs / 1000))
    }

    // Decode JWT to get expiration
    try {
      const payload = this.decodeJWT(token)
      if (payload.exp) {
        const expMs = payload.exp * 1000 // JWT exp is in seconds
        const ttlMs = expMs - Date.now()
        return Math.max(0, Math.floor(ttlMs / 1000))
      }
    } catch (error) {
      this.logger.warn(
        { error: error.message, action: 'ttl_calculation_failed' },
        'Failed to calculate TTL from token'
      )
    }

    // Fallback: use default access token TTL from config
    const defaultTTL = this.configService.get<number>('auth.accessTokenTTL', 900) // 15 min
    return defaultTTL
  }

  /**
   * Calculate expiration date from token
   */
  private calculateExpirationDate(token: string): string {
    try {
      const payload = this.decodeJWT(token)
      if (payload.exp) {
        return new Date(payload.exp * 1000).toISOString()
      }
    } catch {
      // Fallback to default
    }
    const defaultTTL = this.configService.get<number>('auth.accessTokenTTL', 900)
    return new Date(Date.now() + defaultTTL * 1000).toISOString()
  }

  /**
   * Decode JWT payload (no verification, just parsing)
   */
  private decodeJWT(token: string): any {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }

    const payload = parts[1]
    const decoded = Buffer.from(payload, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  }

  /**
   * Check if blacklist entry is expired
   */
  private isEntryExpired(entry: any): boolean {
    if (!entry.expiresAt) return false
    return new Date(entry.expiresAt) < new Date()
  }

  /**
   * Scan for blacklist keys (for stats and cleanup)
   */
  private async scanBlacklistKeys(): Promise<string[]> {
    // This is a simplified implementation
    // In production, you'd want to use SCAN with cursor for large datasets
    const pattern = `${this.BLACKLIST_PREFIX}:*`
    
    try {
      // CacheService should expose a method to scan keys
      // For now, we return empty array (stats will show 0)
      // You can enhance CacheService to add scanKeys() method
      return []
    } catch (error) {
      this.logger.warn(
        { error: error.message, action: 'scan_keys_failed' },
        'Failed to scan blacklist keys'
      )
      return []
    }
  }
}
