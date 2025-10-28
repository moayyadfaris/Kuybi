import { Injectable, Inject } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

/**
 * Cache Service
 * 
 * Provides helper methods for cache operations
 * Abstracts cache-manager for easier testing and maintenance
 */
@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectPinoLogger(CacheService.name) private readonly logger: PinoLogger
  ) {}

  /**
   * Get cached value by key
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cacheManager.get<T>(key)
    } catch (error) {
      this.logger.error({ msg: 'Cache get error', key, error: error.message })
      return undefined
    }
  }

  /**
   * Set cached value with optional TTL (seconds)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const ttlMs = this.normalizeTtl(ttl)
      await this.cacheManager.set(key, value, ttlMs)
    } catch (error) {
      this.logger.error({ msg: 'Cache set error', key, ttl, error: error.message })
    }
  }

  /**
   * Delete cached value by key
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key)
    } catch (error) {
      this.logger.error({ msg: 'Cache delete error', key, error: error.message })
    }
  }

  /**
   * Delete multiple keys matching a pattern
   * WARNING: This can be expensive on large keyspaces
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      // Access the underlying store
      const cacheStore: any = this.cacheManager
      if (cacheStore.store?.client && typeof cacheStore.store.client.keys === 'function') {
        const keys = await cacheStore.store.client.keys(pattern)
        if (keys.length > 0) {
          await Promise.all(keys.map((key: string) => this.del(key)))
        }
      }
    } catch (error) {
      this.logger.error({ msg: 'Cache delete pattern error', pattern, error: error.message })
    }
  }

  /**
   * Clear all cached values
   * Note: This requires direct access to the underlying store
   */
  async reset(): Promise<void> {
    try {
      const cacheStore: any = this.cacheManager
      if (cacheStore.store?.reset) {
        await cacheStore.store.reset()
      } else {
        this.logger.warn('Cache reset not supported by current store')
      }
    } catch (error) {
      this.logger.error({ msg: 'Cache reset error', error: error.message })
    }
  }

  /**
   * Wrap a function with caching
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    try {
      const ttlMs = this.normalizeTtl(ttl)
      return await this.cacheManager.wrap(key, fn, ttlMs)
    } catch (error) {
      this.logger.error({ msg: 'Cache wrap error', key, error: error.message })
      // Fallback to executing the function directly
      return await fn()
    }
  }

  /**
   * Check if cache store is available (health check)
   */
  async isHealthy(): Promise<boolean> {
    try {
      const testKey = 'health:check'
      await this.set(testKey, true, 5)
      const value = await this.get(testKey)
      await this.del(testKey)
      return value === true
    } catch (error) {
      this.logger.error({ msg: 'Cache health check failed', error: error.message })
      return false
    }
  }

  /**
   * Build namespaced cache key
   */
  buildKey(namespace: string, ...parts: (string | number)[]): string {
    return [namespace, ...parts].join(':')
  }

  /**
   * Convert TTL seconds to milliseconds accepted by cache-manager
   */
  private normalizeTtl(ttl?: number): number | undefined {
    if (typeof ttl !== 'number' || !isFinite(ttl) || ttl <= 0) {
      return undefined
    }
    return Math.round(ttl * 1000)
  }
}
