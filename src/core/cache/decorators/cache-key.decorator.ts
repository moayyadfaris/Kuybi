import { SetMetadata } from '@nestjs/common'

/**
 * Custom cache key decorator
 * Use this to define custom cache keys for methods
 *
 * @example
 * @CacheKey('user:profile')
 * async getUserProfile(userId: string) { ... }
 */
export const CACHE_KEY_METADATA = 'cache:key'
export const CacheKey = (key: string) => SetMetadata(CACHE_KEY_METADATA, key)

/**
 * Cache TTL decorator
 * Override default TTL for specific methods
 *
 * @example
 * @CacheTTL(600) // 10 minutes
 * async getCountries() { ... }
 */
export const CACHE_TTL_METADATA = 'cache:ttl'
export const CacheTTL = (ttl: number) => SetMetadata(CACHE_TTL_METADATA, ttl)
