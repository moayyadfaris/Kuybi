import { Injectable, Inject } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api'

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
    const tracer = trace.getTracer('cache-service')
    const span = tracer.startSpan('cache.get', {
      attributes: {
        'cache.operation': 'get',
        'cache.key': this.sanitizeKey(key),
      },
    })

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const value = await this.cacheManager.get<T>(key)
        const hit = value !== undefined && value !== null
        span.setAttribute('cache.hit', hit)

        if (hit && typeof value === 'string') {
          span.setAttribute('cache.size', Buffer.byteLength(value))
        }

        span.setStatus({ code: SpanStatusCode.OK })
        return value
      } catch (error) {
        this.logger.error({ msg: 'Cache get error', key, error: error.message })
        span.recordException(error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
        return undefined
      } finally {
        span.end()
      }
    })
  }

  /**
   * Set cached value with optional TTL (seconds)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const tracer = trace.getTracer('cache-service')
    const span = tracer.startSpan('cache.set', {
      attributes: {
        'cache.operation': 'set',
        'cache.key': this.sanitizeKey(key),
        ...(ttl && { 'cache.ttl': ttl })
      }
    })

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const ttlMs = this.normalizeTtl(ttl)

        if (typeof value === 'string') {
          span.setAttribute('cache.size', Buffer.byteLength(value))
        } else if (value) {
          span.setAttribute('cache.size', JSON.stringify(value).length)
        }

        await this.cacheManager.set(key, value, ttlMs)
        span.setStatus({ code: SpanStatusCode.OK })
      } catch (error) {
        this.logger.error({ msg: 'Cache set error', key, ttl, error: error.message })
        span.recordException(error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      } finally {
        span.end()
      }
    })
  }

  /**
   * Delete cached value by key
   */
  async del(key: string): Promise<void> {
    const tracer = trace.getTracer('cache-service')
    const span = tracer.startSpan('cache.del', {
      attributes: {
        'cache.operation': 'del',
        'cache.key': this.sanitizeKey(key)
      }
    })

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        await this.cacheManager.del(key)
        span.setStatus({ code: SpanStatusCode.OK })
      } catch (error) {
        this.logger.error({ msg: 'Cache delete error', key, error: error.message })
        span.recordException(error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
      } finally {
        span.end()
      }
    })
  }

  /**
   * Delete multiple keys matching a pattern
   * WARNING: This can be expensive on large keyspaces
   */
  async delPattern(pattern: string): Promise<void> {
    try {
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
  async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const tracer = trace.getTracer('cache-service')
    const span = tracer.startSpan('cache.wrap', {
      attributes: {
        'cache.operation': 'wrap',
        'cache.key': this.sanitizeKey(key),
        ...(ttl && { 'cache.ttl': ttl })
      }
    })

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const ttlMs = this.normalizeTtl(ttl)
        const result = await this.cacheManager.wrap(key, fn, ttlMs)
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        this.logger.error({ msg: 'Cache wrap error', key, error: error.message })
        span.recordException(error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
        // Fallback to executing the function directly
        return await fn()
      } finally {
        span.end()
      }
    })
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

  /**
   * Sanitize cache key for tracing (remove sensitive data, limit length)
   */
  private sanitizeKey(key: string): string {
    // Limit key length for trace attributes
    if (key.length > 100) {
      return key.substring(0, 97) + '...'
    }
    return key
  }
}
