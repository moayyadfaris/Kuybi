import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler'
import Redis, { RedisOptions } from 'ioredis'

/**
 * Counts hits and applies the block in one atomic step.
 * KEYS: hits counter, block flag. ARGV: ttl ms, limit, block ms.
 * Returns { hits, hits ttl ms, blocked (0/1), block ttl ms }.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  return { tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local hitsTtl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, hitsTtl, 1, tonumber(ARGV[3]) }
end
return { hits, hitsTtl, 0, 0 }
`

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>

const KEY_PREFIX = 'kuybi:throttle:'

/**
 * Rate-limit counters in Redis, shared by every API instance. The default in-memory
 * storage counts per process, so N instances allowed N times the configured limit.
 *
 * If Redis is unreachable the limiter falls back to per-process counting rather than
 * rejecting all traffic.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly redis: Redis
  private readonly fallback = new ThrottlerStorageService()

  constructor(
    options: RedisOptions,
    private readonly onError: (error: unknown) => void = () => undefined
  ) {
    this.redis = new Redis({ ...options, lazyConnect: true, maxRetriesPerRequest: 1 })
    this.redis.on('error', error => this.onError(error))
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `${KEY_PREFIX}${throttlerName}:${key}`
    try {
      const [hits, hitsTtl, blocked, blockTtl] = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        hitsKey,
        `${hitsKey}:blocked`,
        ttl,
        limit,
        blockDuration
      )) as [number, number, number, number]
      return {
        totalHits: hits,
        timeToExpire: Math.ceil(Math.max(hitsTtl, 0) / 1000),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.ceil(Math.max(blockTtl, 0) / 1000)
      }
    } catch (error) {
      this.onError(error)
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName)
    }
  }

  async close(): Promise<void> {
    this.fallback.onApplicationShutdown()
    await this.redis.quit().catch(() => undefined)
  }
}
