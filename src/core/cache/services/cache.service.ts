import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cache } from 'cache-manager'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { CircuitBreaker, withTimeout } from '@shared/utils/resilience'

/**
 * Cache Service
 *
 * Provides helper methods for cache operations
 * Abstracts cache-manager for easier testing and maintenance
 */
@Injectable()
export class CacheService {
  private readonly timeoutMs: number
  private readonly breaker: CircuitBreaker

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectPinoLogger(CacheService.name) private readonly logger: PinoLogger,
    private readonly configService: ConfigService
  ) {
    this.timeoutMs = this.configService.get<number>('resilience.cache.timeoutMs', 1500)
    this.breaker = new CircuitBreaker({
      name: 'cache',
      failureThreshold: this.configService.get<number>('resilience.cache.failureThreshold', 10),
      resetTimeoutMs: this.configService.get<number>('resilience.cache.resetTimeoutMs', 20000),
      halfOpenSuccesses: 2
    })
  }

  /**
   * Get cached value by key
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.executeWithResilience(
      'get',
      () => this.cacheManager.get<T>(key),
      undefined,
      { key }
    )
  }

  /**
   * Set cached value with optional TTL (seconds)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const ttlMs = this.normalizeTtl(ttl)
    await this.executeWithResilience('set', () => this.cacheManager.set(key, value, ttlMs), undefined, {
      key,
      ttl
    })
  }

  /**
   * Delete cached value by key
   */
  async del(key: string): Promise<void> {
    await this.executeWithResilience('del', () => this.cacheManager.del(key), undefined, { key })
  }

  /**
   * Delete multiple keys matching a pattern
   * WARNING: This can be expensive on large keyspaces
   */
  async delPattern(pattern: string): Promise<void> {
    await this.executeWithResilience('delPattern', () => this.deletePatternInternal(pattern), undefined, {
      pattern
    })
  }

  /**
   * Clear all cached values
   * Note: This requires direct access to the underlying store
   */
  async reset(): Promise<void> {
    await this.executeWithResilience('reset', async () => {
      const cacheStore: any = this.cacheManager
      if (cacheStore.store?.reset) {
        await cacheStore.store.reset()
      } else {
        this.logger.warn('Cache reset not supported by current store')
      }
    })
  }

  /**
   * Wrap a function with caching
   */
  async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const ttlMs = this.normalizeTtl(ttl)
    return this.executeWithResilience(
      'wrap',
      () => this.cacheManager.wrap(key, fn, ttlMs),
      undefined,
      { key, ttl },
      fn
    )
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

  private async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>,
    fallbackValue?: T,
    meta?: Record<string, unknown>,
    fallbackFn?: () => Promise<T>
  ): Promise<T> {
    try {
      return await this.breaker.exec(() =>
        withTimeout(
          () => fn(),
          this.timeoutMs,
          () =>
            this.logger.warn(
              { operation, timeoutMs: this.timeoutMs, ...meta },
              `Cache ${operation} timed out after ${this.timeoutMs}ms`
            )
        )
      )
    } catch (error) {
      this.logger.error(
        { msg: `Cache ${operation} error`, error: (error as Error).message, ...meta },
        `Cache ${operation} failed`
      )
      if (fallbackFn) {
        return fallbackFn()
      }
      return fallbackValue as T
    }
  }

  private async deletePatternInternal(pattern: string): Promise<void> {
    this.logger.info({ pattern }, 'Attempting to delete cache keys matching pattern')

    const cacheStore: any = this.cacheManager
    const keyvInstance: any = cacheStore?.store ?? cacheStore?.stores?.[0] ?? cacheStore
    const keyvStore: any =
      keyvInstance?._store ?? keyvInstance?.store ?? keyvInstance?.opts?.store ?? null

    const namespace: string =
      keyvInstance?.opts?.namespace ??
      keyvInstance?._namespace ??
      keyvStore?.namespace ??
      keyvStore?._namespace ??
      ''

    const separator: string =
      keyvStore?.keyPrefixSeparator ??
      keyvStore?._keyPrefixSeparator ??
      keyvInstance?.opts?.keyPrefixSeparator ??
      '::'

    const prefix = namespace ? `${namespace}${separator}` : ''
    const namespacedPattern = prefix ? `${prefix}${pattern}` : pattern

    const redisClient: any =
      keyvStore?.client ??
      keyvStore?._client ??
      cacheStore?.store?.client ??
      cacheStore?.store?._client ??
      null

    const keysToDelete: string[] = []

    if (redisClient?.scanIterator) {
      for await (const rawKey of redisClient.scanIterator({ MATCH: namespacedPattern })) {
        const key = typeof rawKey === 'string' ? rawKey : rawKey.toString()
        const normalizedKey = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key
        keysToDelete.push(normalizedKey)
      }
    } else if (redisClient?.keys) {
      const redisKeys = await redisClient.keys(namespacedPattern)
      for (const key of redisKeys) {
        const normalizedKey = prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key
        keysToDelete.push(normalizedKey)
      }
    } else if (typeof keyvInstance?.iterator === 'function') {
      const toRegex = (value: string): RegExp => {
        const escaped = value.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
        return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
      }

      const matcher = toRegex(pattern)
      for await (const [key] of keyvInstance.iterator(namespace || undefined)) {
        if (matcher.test(key)) {
          keysToDelete.push(key)
        }
      }
    } else {
      this.logger.warn({ pattern }, 'Cache store does not support pattern deletion')
      return
    }

    if (keysToDelete.length === 0) {
      this.logger.info({ pattern }, 'No cache keys found matching pattern')
      return
    }

    await Promise.all(keysToDelete.map((key: string) => this.del(key)))
    this.logger.info({ pattern, deletedCount: keysToDelete.length }, 'Cache keys deleted')
  }
}
