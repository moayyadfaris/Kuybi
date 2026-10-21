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
  /** Keyv's own serializer, so entries written by the script read back like any other */
  serialize?: (data: { value: unknown; expires: number }) => string | Promise<string>
}

/**
 * Stores an entry and records it under its tags, in one step, unless one of the tags was
 * invalidated after the entry's data was read (`since`, the fence taken before reading;
 * '' skips the check): a read that started before a write and finished after the
 * write's invalidation would otherwise cache the old data. The entry is written only
 * after the check, so a refused entry is never visible, not even for a moment. Tag sets
 * get a TTL that only grows: a set must outlive every entry it tracks. Returns 0 when
 * the entry was refused.
 * KEYS[1] entry; ARGV: entry key in the sets, set TTL, since, fence prefix, tag-set
 * prefix, serialized entry, entry TTL (ms), tags... (single-node Redis: derived keys are
 * not declared in KEYS)
 */
const TAG_SCRIPT = `
local since = ARGV[3]
if since ~= '' then
  for i = 8, #ARGV do
    local invalidated = redis.call('GET', ARGV[4] .. ARGV[i])
    if invalidated and tonumber(invalidated) > tonumber(since) then
      redis.call('UNLINK', KEYS[1])
      return 0
    end
  end
end
redis.call('SET', KEYS[1], ARGV[6], 'PX', tonumber(ARGV[7]))
local ttl = tonumber(ARGV[2])
for i = 8, #ARGV do
  local set = ARGV[5] .. ARGV[i]
  redis.call('SADD', set, ARGV[1])
  if redis.call('TTL', set) < ttl then redis.call('EXPIRE', set, ttl) end
end
return 1`

/**
 * Deletes every entry of a tag set and the set, atomically (an entry tagged while the
 * invalidation runs cannot drop out of the set yet survive), and stamps the tag with the
 * next invalidation number, which TAG_SCRIPT compares with an entry's fence.
 * KEYS[1] tag set; ARGV: entry prefix, tag fence key, sequence key, fence TTL
 */
const INVALIDATE_SCRIPT = `
local seq = redis.call('INCR', ARGV[3])
redis.call('SET', ARGV[2], seq, 'EX', tonumber(ARGV[4]))
local members = redis.call('SMEMBERS', KEYS[1])
for _, key in ipairs(members) do redis.call('UNLINK', ARGV[1] .. key) end
redis.call('DEL', KEYS[1])
return #members`

/** How long a tag's invalidation number is kept: far longer than any cache fill takes */
const FENCE_TTL_SECONDS = 300

/**
 * The application cache: get/set/del plus tag-based invalidation (ADR 0003). Entries are
 * stored by Keyv under the app's namespace; tag sets are plain Redis sets under
 * `<namespace>:_tags:`, with each tag's latest invalidation number at
 * `<namespace>:_fence:` (no entity name starts with an underscore, so these never share
 * a key with an entry). Every call goes through a timeout and a circuit breaker and degrades
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
   * The current invalidation number. Take it before reading the data to cache and pass
   * it to setWithTags (`since`): the entry is refused if a tag of it was invalidated in
   * between. Undefined when Redis is unavailable (then do not cache).
   */
  async fence(): Promise<number | undefined> {
    return this.resilient(
      'fence',
      async () => {
        const client = await this.client()
        return Number(
          (await client.eval(`return redis.call('GET', KEYS[1])`, {
            keys: [this.sequenceKey()],
            arguments: []
          })) ?? 0
        )
      },
      {}
    )
  }

  /**
   * Stores a value and records its key under each tag, for invalidateTag, atomically
   * (TAG_SCRIPT): never an entry without its tags, which could not be invalidated. With
   * `since` (from fence(), taken before the data was read) the entry is not stored if one
   * of its tags was invalidated meanwhile. Returns whether the entry was stored.
   */
  async setWithTags<T>(
    key: string,
    value: T,
    tags: string[],
    ttl?: number,
    options: { since?: number } = {}
  ): Promise<boolean> {
    const ttlMs = this.ttlMs(ttl)
    const tagTtl = String(this.ttlSeconds(ttl) + 300)
    const kept = await this.resilient(
      'setWithTags',
      async () => {
        const serialize = this.keyv.serialize
        if (!serialize) throw new Error('The cache store has no serializer')
        // Keyv's envelope, so get() reads the entry like one written by set()
        const entry = await serialize({ value, expires: Date.now() + ttlMs })
        const client = await this.client()
        const result = await client.eval(TAG_SCRIPT, {
          keys: [this.entryPrefix() + key],
          arguments: [
            key,
            tagTtl,
            options.since === undefined ? '' : String(options.since),
            this.fencePrefix(),
            this.tagPrefix(),
            entry,
            String(ttlMs),
            ...tags
          ]
        })
        return result === 1
      },
      { key, tags }
    )
    return kept === true
  }

  /** Deletes every entry recorded under the tag */
  async invalidateTag(tag: string): Promise<void> {
    await this.resilient(
      'invalidateTag',
      async () => {
        const client = await this.client()
        const count = await client.eval(INVALIDATE_SCRIPT, {
          keys: [this.tagPrefix() + tag],
          arguments: [
            this.entryPrefix(),
            this.fencePrefix() + tag,
            this.sequenceKey(),
            String(FENCE_TTL_SECONDS)
          ]
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

  private tagPrefix(): string {
    return `${this.entryPrefix()}_tags:`
  }

  /** Where each tag's latest invalidation number is kept */
  private fencePrefix(): string {
    return `${this.entryPrefix()}_fence:`
  }

  private sequenceKey(): string {
    return `${this.entryPrefix()}_seq`
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
