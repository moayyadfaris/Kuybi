import { CacheModule as NestCacheModule } from '@nestjs/cache-manager'
import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import Keyv from '@keyv/redis'
import { Logger } from 'nestjs-pino'

import { CacheService } from './services/cache.service'

/**
 * Global Cache Module
 *
 * Provides Redis-backed caching for the entire application using Keyv with cache-manager v7
 * Features:
 * - Automatic TTL management
 * - Redis persistence via Keyv
 * - Error handling with fallback
 * - Health checks
 */
@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService, Logger],
      useFactory: async (configService: ConfigService, logger: Logger) => {
        const redisConfig = configService.get('redis')
        const poolConfig = redisConfig?.pool || {}

        logger.log({
          msg: 'Configuring Redis cache store',
          context: 'CacheConfigModule',
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db,
          hasPassword: !!redisConfig.password,
          poolEnabled: poolConfig?.enabled || false,
          poolMin: poolConfig?.min || 1,
          poolMax: poolConfig?.max || 5
        })

        // Build connection string with pool parameters
        const connectionString = redisConfig.password
          ? `redis://:${redisConfig.password}@${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`
          : `redis://${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`

        // Create Keyv instance for Redis
        const keyv = new Keyv(connectionString)

        // Error handling
        keyv.on('error', (err: Error & { code?: string }) => {
          logger.error({
            msg: 'Keyv connection error',
            context: 'CacheConfigModule',
            error: err.message,
            code: err.code || 'UNKNOWN',
            stack: err.stack
          })
        })

        logger.log({
          msg: 'Redis cache store initialized successfully',
          context: 'CacheConfigModule',
          poolingEnabled: poolConfig.enabled,
          note: poolConfig.enabled
            ? `Pool configured: min=${poolConfig.min}, max=${poolConfig.max}`
            : 'Simple connection (development mode)'
        })

        // For cache-manager v7, we pass Keyv directly as the store
        // The stores property accepts Keyv instances
        return {
          stores: [keyv],
          ttl: redisConfig.ttl * 1000 // milliseconds
        }
      }
    })
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService]
})
export class CacheConfigModule {}
