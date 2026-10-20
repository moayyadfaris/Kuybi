import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CircuitBreaker, withTimeout } from '@shared/utils/resilience'
import { Cache } from 'cache-manager'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

/** What this service needs from the Redis client behind the Keyv store */
interface ScriptRunner {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
}

/** The Keyv instance cache-manager holds, with its @keyv/redis adapter */
interface RedisKeyv {
  namespace?: string
  store: { getClient(): Promise<ScriptRunner> }
}

/**
 * Adds an entry key to a tag set, extending the set's TTL but never shortening it: the
 * set must outlive every entry it tracks, or a long-lived entry could no longer be
 * invalidated. A set without TTL gets one.
 */
const TAG_SCRIPT = `
redis.call('SADD', KEYS[1], ARGV[1])
local ttl = tonumber(ARGV[2])
if redis.call('TTL', KEYS[1]) < ttl then redis.call('EXPIRE', KEYS[1], ttl) end
return 1`

/**
 * Deletes every entry of a tag set and the set, atomically: an entry tagged while the
 * invalidation runs cannot be dropped from the set yet survive in the cache.
 * (Single-node Redis: entry keys are derived, not declared in KEYS.)
 */
const INVALIDATE_SCRIPT = `
local members = redis.call('SMEMBERS', KEYS[1])
for _, key in ipairs(members) do redis.call('UNLINK', ARGV[1] .. key) end
redis.call('DEL', KEYS[1])
return #members`

/**
 * The application cache: get/set/del plus tag-based invalidation (ADR 0003). Entries are
 * stored by Keyv under the app's namespace; tag sets are plain Redis sets under
 * `<namespace>:_tags:` (no entity name starts with an underscore, so a tag set never
 * shares a key with an entry). Every call goes through a timeout and a circuit breaker and degrades
 * to a miss (or a no-op) when Redis is unavailable.
 */
@Injectable()
export class CacheService {
  private readonly timeoutMs: number
  private readonly breaker: CircuitBreaker
  private readonly defaultTtlSeconds: number

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectPinoLogger(CacheService.name) private readonly logger: PinoLogger,
    private readonly configService: ConfigService
  ) {
    this.timeoutMs = this.configService.get<number>('resilience.cache.timeoutMs', 1500)
    this.defaultTtlSeconds = this.configService.get<number>('redis.ttl', 3600)
    this.breaker = new CircuitBreaker({
      name: 'cache',
      failureThreshold: this.configService.get<number>('resilience.cache.failureThreshold', 10),
      resetTimeoutMs: this.configService.get<number>('resilience.cache.resetTimeoutMs', 20000),
      halfOpenSuccesses: 2
    })
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.resilient('get', () => this.cacheManager.get<T>(key), { key })
    return value ?? undefined
  }

  /** Stores a value; `ttl` in seconds (the configured default when omitted) */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.resilient('set', () => this.cacheManager.set(key, value, this.ttlMs(ttl)), {
      key,
      ttl
    })
  }

  async del(key: string): Promise<void> {
    await this.resilient('del', () => this.cacheManager.del(key), { key })
  }

  /**
   * Stores a value and records its key under each tag, for invalidateTag. If the tags
   * cannot be recorded the entry is removed again: an untracked entry could never be
   * invalidated and would be served stale until it expires.
   */
  async setWithTags<T>(key: string, value: T, tags: string[], ttl?: number): Promise<void> {
    await this.set(key, value, ttl)
    const tagTtl = String(this.ttlSeconds(ttl) + 300)
    const tagged = await this.resilient(
      'setWithTags',
      async () => {
        const client = await this.client()
        for (const tag of tags) {
          await client.eval(TAG_SCRIPT, { keys: [this.tagKey(tag)], arguments: [key, tagTtl] })
        }
        return true
      },
      { key, tags }
    )
    if (!tagged) await this.del(key)
  }

  /** Deletes every entry recorded under the tag */
  async invalidateTag(tag: string): Promise<void> {
    await this.resilient(
      'invalidateTag',
      async () => {
        const client = await this.client()
        const count = await client.eval(INVALIDATE_SCRIPT, {
          keys: [this.tagKey(tag)],
          arguments: [this.entryPrefix()]
        })
        this.logger.debug({ tag, keysInvalidated: count }, 'Cache tag invalidated')
      },
      { tag }
    )
  }

  async invalidateTags(tags: string[]): Promise<void> {
    await Promise.all(tags.map(tag => this.invalidateTag(tag)))
  }

  /** Round-trips a value through the cache (health checks) */
  async isHealthy(): Promise<boolean> {
    const key = 'health:check'
    await this.set(key, true, 5)
    const value = await this.get(key)
    await this.del(key)
    return value === true
  }

  buildKey(namespace: string, ...parts: (string | number)[]): string {
    return [namespace, ...parts].join(':')
  }

  private get keyv(): RedisKeyv {
    return (this.cacheManager as unknown as { stores: RedisKeyv[] }).stores[0]
  }

  /**
   * The connected Redis client. Keyv connects it lazily on its first get or set, so a
   * process whose first cache call is a tag operation (a worker job) must connect it.
   */
  private client(): Promise<ScriptRunner> {
    return this.keyv.store.getClient()
  }

  /** Raw Redis prefix of Keyv entries, e.g. "kuybi:" */
  private entryPrefix(): string {
    return this.keyv.namespace ? `${this.keyv.namespace}:` : ''
  }

  private tagKey(tag: string): string {
    return `${this.entryPrefix()}_tags:${tag}`
  }

  private ttlSeconds(ttl?: number): number {
    return typeof ttl === 'number' && isFinite(ttl) && ttl > 0 ? ttl : this.defaultTtlSeconds
  }

  private ttlMs(ttl?: number): number {
    return Math.round(this.ttlSeconds(ttl) * 1000)
  }

  /** Runs a cache call through the breaker and timeout; undefined when it fails */
  private async resilient<T>(
    operation: string,
    fn: () => Promise<T>,
    meta: Record<string, unknown>
  ): Promise<T | undefined> {
    try {
      return await this.breaker.exec(() =>
        withTimeout(fn, this.timeoutMs, () =>
          this.logger.warn(
            { operation, timeoutMs: this.timeoutMs, ...meta },
            'Cache call timed out'
          )
        )
      )
    } catch (error) {
      this.logger.error(
        { operation, error: (error as Error).message, ...meta },
        `Cache ${operation} failed`
      )
      return undefined
    }
  }
}
