/**
 * CacheService against the real Redis store (other integration tests use
 * InMemoryCacheService). The Redis server is shared with other projects, so every key -
 * entries and tag sets - must stay under Kuybi's namespace; tag invalidation must work in
 * a process whose first cache call it is (the worker); and a tag set must live as long as
 * the longest-lived entry it tracks.
 */
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import Redis from 'ioredis'
import { LoggerModule } from 'nestjs-pino'

import { TokenBlacklistService } from '@modules/auth/services/token-blacklist.service'

import { CacheConfigModule } from '@core/cache/cache.module'
import { CacheService } from '@core/cache/services/cache.service'

import { TestRedis } from '../../helpers/test-redis'
import { testConfig } from '../../test.config'

describe('CacheService on Redis', () => {
  const namespace = `kuybi-cache-test-${process.pid}`
  const modules: TestingModule[] = []
  let redis: Redis

  /** A fresh CacheService, as a new process (API, worker, script) would build it */
  const freshCache = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ redis: { ...testConfig.redis, ttl: 60, cacheNamespace: namespace } })]
        }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        CacheConfigModule
      ],
      providers: [TokenBlacklistService]
    }).compile()
    await moduleRef.init()
    modules.push(moduleRef)
    return moduleRef
  }
  const rawKeys = async (pattern: string) => (await redis.keys(pattern)).sort()

  beforeAll(async () => {
    redis = new Redis({ ...testConfig.redis })
  })

  afterEach(async () => {
    const keys = await redis.keys(`${namespace}:*`)
    if (keys.length) await redis.del(...keys)
  })

  afterAll(async () => {
    for (const moduleRef of modules) await moduleRef.close()
    await redis.quit()
  })

  it("keeps entries and tag sets under the app's namespace", async () => {
    const cache = (await freshCache()).get(CacheService)
    await cache.setWithTags('story:1', { id: 1 }, ['story', 'story:row:1'], 60)

    expect(await rawKeys(`${namespace}:*`)).toEqual(
      [`${namespace}:story:1`, `${namespace}:_tags:story`, `${namespace}:_tags:story:row:1`].sort()
    )
    expect(await rawKeys('keyv:story:1')).toEqual([])
    expect(await rawKeys('cache:tag:story:row:1')).toEqual([])
    expect(await cache.get('story:1')).toEqual({ id: 1 })
  })

  it('invalidates a tag when that is the first cache call of a process', async () => {
    const writer = (await freshCache()).get(CacheService)
    await writer.setWithTags('story:2', { id: 2 }, ['story'], 60)

    const worker = (await freshCache()).get(CacheService)
    await worker.invalidateTag('story')

    expect(await writer.get('story:2')).toBeUndefined()
    expect(await rawKeys(`${namespace}:_tags:story`)).toEqual([])
  })

  it('keeps a tag set as long as its longest-lived entry', async () => {
    const cache = (await freshCache()).get(CacheService)
    await cache.setWithTags('long', 'kept an hour', ['shared'], 3600)
    await cache.setWithTags('short', 'kept ten seconds', ['shared'], 10)

    expect(await redis.ttl(`${namespace}:_tags:shared`)).toBeGreaterThanOrEqual(3600)
  })

  it('clears only its own keys from the shared test database', async () => {
    const cache = (await freshCache()).get(CacheService)
    await cache.set('mine', 1, 60)
    await redis.set('another-project:key', 'keep', 'EX', 60)

    await TestRedis.createConnection()
    await TestRedis.clearCache(namespace)

    expect(await rawKeys(`${namespace}:*`)).toEqual([])
    expect(await redis.get('another-project:key')).toBe('keep')
    await redis.del('another-project:key')
    await TestRedis.closeConnection()
  })

  describe('TokenBlacklistService', () => {
    // Unsigned JWT-shaped token; the service only decodes `exp`
    const token = (id: string, expSeconds: number) =>
      [
        Buffer.from('{"alg":"none"}').toString('base64url'),
        Buffer.from(
          JSON.stringify({ sub: id, jti: `${namespace}-${id}`, exp: expSeconds })
        ).toString('base64url'),
        'sig'
      ].join('.')
    const now = () => Math.floor(Date.now() / 1000)

    it('rejects a blacklisted token until it would have expired, stored by hash', async () => {
      const blacklist = (await freshCache()).get(TokenBlacklistService)
      const live = token('live', now() + 3600)

      expect(await blacklist.isTokenBlacklisted(live)).toBe(false)
      const { tokenHash } = await blacklist.blacklistToken(live, { reason: 'logout' })
      expect(await blacklist.isTokenBlacklisted(live)).toBe(true)
      expect(await rawKeys(`${namespace}:token:blacklist:${tokenHash}`)).toHaveLength(1)
    })

    it('skips a token that has already expired', async () => {
      const blacklist = (await freshCache()).get(TokenBlacklistService)
      const expired = token('expired', now() - 60)

      await blacklist.blacklistToken(expired)
      expect(await blacklist.isTokenBlacklisted(expired)).toBe(false)
    })
  })
})
