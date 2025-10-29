import { Module, Global } from '@nestjs/common'
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager'
import { ConfigModule, ConfigService } from '@nestjs/config'
import Keyv from '@keyv/redis'
import { CacheService } from './services/cache.service'
import { Logger } from 'nestjs-pino'

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

        logger.log({
          msg: 'Configuring Redis cache store',
          context: 'CacheConfigModule',
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db,
          hasPassword: !!redisConfig.password
        })

        const connectionString = redisConfig.password
          ? `redis://:${redisConfig.password}@${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`
          : `redis://${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`

        // Create Keyv instance for Redis
        const keyv = new Keyv(connectionString)

        // Error handling
        keyv.on('error', err => {
          logger.error({
            msg: 'Keyv connection error',
            context: 'CacheConfigModule',
            error: err.message,
            code: err.code,
            stack: err.stack
          })
        })

        logger.log({
          msg: 'Redis cache store initialized successfully',
          context: 'CacheConfigModule'
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
