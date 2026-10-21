import { CacheManagerOptions, CacheModule as NestCacheModule } from '@nestjs/cache-manager'
import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { createKeyv } from '@keyv/redis'
import { Logger } from 'nestjs-pino'

import { CacheService } from './services/cache.service'

/**
 * Global Redis cache (cache-manager v7 over Keyv). Every key, entries and tag sets, is
 * stored under the app's namespace (CACHE_NAMESPACE, default "kuybi"): the Redis server
 * may be shared with other applications, which must not see or clear Kuybi's keys.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService, Logger],
      useFactory: (configService: ConfigService, logger: Logger): CacheManagerOptions => {
        const redis = configService.getOrThrow('redis')
        const auth = redis.password ? `:${encodeURIComponent(redis.password)}@` : ''
        const keyv = createKeyv(`redis://${auth}${redis.host}:${redis.port}/${redis.db}`, {
          namespace: redis.cacheNamespace ?? 'kuybi',
          keyPrefixSeparator: ':'
        })
        keyv.on('error', (error: Error & { code?: string }) =>
          logger.error({
            msg: 'Redis cache error',
            context: 'CacheConfigModule',
            error: error.message,
            code: error.code ?? 'UNKNOWN'
          })
        )
        // The same Keyv class at runtime; @keyv/redis and cache-manager resolve separate
        // copies of its type declarations
        return { stores: [keyv], ttl: redis.ttl * 1000 } as unknown as CacheManagerOptions
      }
    })
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService]
})
export class CacheConfigModule {}
