/**
 * Pattern operations against the real Redis-backed cache. Other integration tests swap
 * in InMemoryCacheService, which hid that node-redis 5 yields SCAN results in batches
 * (string[] per page): delPattern used to delete nothing once a page held two keys.
 */
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { LoggerModule } from 'nestjs-pino'

import { TokenBlacklistService } from '@modules/auth/services/token-blacklist.service'

import { CacheConfigModule } from '@core/cache/cache.module'
import { CacheService } from '@core/cache/services/cache.service'

import { testConfig } from '../../test.config'

describe('CacheService key patterns (real Redis)', () => {
  // Own prefix: never touches other keys in the (shared) Redis
  const ns = `kuybi-cache-test-${process.pid}`
  let moduleRef: TestingModule
  let cache: CacheService

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ redis: { ...testConfig.redis, ttl: 60 } })]
        }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        CacheConfigModule
      ],
      providers: [TokenBlacklistService]
    }).compile()
    cache = moduleRef.get(CacheService)
  })

  afterAll(async () => {
    await cache.delPattern(`${ns}:*`)
    await moduleRef.close()
  })

  it('finds every key matching a pattern, without the store namespace', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => cache.set(`${ns}:scan:${i}`, { i }, 60)))
    await cache.set(`${ns}:other:1`, { i: 1 }, 60)

    const keys = await cache.scanKeys(`${ns}:scan:*`)

    expect(keys.sort()).toEqual(Array.from({ length: 25 }, (_, i) => `${ns}:scan:${i}`).sort())
    // Returned keys work with get/del as-is
    expect(await cache.get(keys[0])).toEqual({ i: Number(keys[0].split(':').pop()) })
  })

  it('deletes every key matching a pattern and leaves the rest', async () => {
    await Promise.all(Array.from({ length: 25 }, (_, i) => cache.set(`${ns}:del:${i}`, { i }, 60)))
    await cache.set(`${ns}:keep:1`, { keep: true }, 60)

    await cache.delPattern(`${ns}:del:*`)

    expect(await cache.scanKeys(`${ns}:del:*`)).toEqual([])
    expect(await cache.get(`${ns}:del:0`)).toBeUndefined()
    expect(await cache.get(`${ns}:keep:1`)).toEqual({ keep: true })
  })

  describe('TokenBlacklistService', () => {
    // Unsigned JWT-shaped token; the service only decodes `exp`
    const token = (id: string, expSeconds: number) =>
      [
        Buffer.from('{"alg":"none"}').toString('base64url'),
        Buffer.from(JSON.stringify({ sub: id, jti: `${ns}-${id}`, exp: expSeconds })).toString(
          'base64url'
        ),
        'sig'
      ].join('.')
    const now = () => Math.floor(Date.now() / 1000)

    it('rejects a blacklisted token until it would have expired', async () => {
      const blacklist = moduleRef.get(TokenBlacklistService)
      const live = token('live', now() + 3600)

      expect(await blacklist.isTokenBlacklisted(live)).toBe(false)
      const { tokenHash } = await blacklist.blacklistToken(live, { reason: 'logout' })
      expect(await blacklist.isTokenBlacklisted(live)).toBe(true)

      // Stored under the token's hash, never the token itself
      const [key] = await cache.scanKeys(`token:blacklist:${tokenHash}`)
      expect(key).toBe(`token:blacklist:${tokenHash}`)
      await cache.del(key)
    })

    it('skips a token that has already expired', async () => {
      const blacklist = moduleRef.get(TokenBlacklistService)
      const expired = token('expired', now() - 60)

      await blacklist.blacklistToken(expired)
      expect(await blacklist.isTokenBlacklisted(expired)).toBe(false)
    })
  })
})
