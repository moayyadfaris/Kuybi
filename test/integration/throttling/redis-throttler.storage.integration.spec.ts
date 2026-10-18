import { randomUUID } from 'crypto'

import { RedisThrottlerStorage } from '@core/throttling/redis-throttler.storage'

import { testConfig } from '../../test.config'

const redis = {
  host: testConfig.redis.host,
  port: testConfig.redis.port,
  db: testConfig.redis.db
}

describe('RedisThrottlerStorage', () => {
  // Two storages = two API instances behind a load balancer
  const serverA = new RedisThrottlerStorage(redis)
  const serverB = new RedisThrottlerStorage(redis)

  afterAll(async () => {
    await serverA.close()
    await serverB.close()
  })

  it('enforces one limit across all instances', async () => {
    const key = `client-${randomUUID()}`
    const hit = (server: RedisThrottlerStorage) =>
      server.increment(key, 60_000, 3, 60_000, 'default')

    expect((await hit(serverA)).isBlocked).toBe(false)
    expect((await hit(serverB)).isBlocked).toBe(false)
    expect((await hit(serverA)).totalHits).toBe(3)

    const fourth = await hit(serverB)
    expect(fourth.isBlocked).toBe(true)
    expect(fourth.timeToBlockExpire).toBeGreaterThan(0)
    // Still blocked on the other instance
    expect((await hit(serverA)).isBlocked).toBe(true)
  })

  it('reports the window in seconds and starts a new one when it expires', async () => {
    const key = `client-${randomUUID()}`

    const first = await serverA.increment(key, 1_000, 5, 1_000, 'default')
    expect(first.timeToExpire).toBe(1)

    await new Promise(resolve => setTimeout(resolve, 1_100))
    expect((await serverA.increment(key, 1_000, 5, 1_000, 'default')).totalHits).toBe(1)
  })

  it('falls back to per-process counting when Redis is unreachable', async () => {
    const errors: unknown[] = []
    const offline = new RedisThrottlerStorage({ host: '127.0.0.1', port: 1 }, e => errors.push(e))

    const result = await offline.increment('client', 60_000, 1, 60_000, 'default')

    expect(result.totalHits).toBe(1)
    expect(result.isBlocked).toBe(false)
    expect(errors.length).toBeGreaterThan(0)
    await offline.close()
  })
})
