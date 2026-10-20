/**
 * Test Redis utilities
 * Helpers for Redis mocking and cleanup
 */

import Redis from 'ioredis'

import { testConfig } from '../test.config'

export class TestRedis {
  private static client: Redis

  /**
   * Create a test Redis connection
   */
  static async createConnection(): Promise<Redis> {
    if (this.client) {
      return this.client
    }

    this.client = new Redis({
      host: testConfig.redis.host,
      port: testConfig.redis.port,
      db: testConfig.redis.db,
      lazyConnect: true
    })

    await this.client.connect()
    return this.client
  }

  /**
   * Close Redis connection
   */
  static async closeConnection(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      this.client = undefined as unknown as Redis // Reset client so next test can create a new one
    }
  }

  /**
   * Deletes the app's cache keys (entries and tag sets) from the test database. Only keys
   * under the namespace: the Redis server, test database included, may be shared with
   * other projects, so never FLUSHDB.
   */
  static async clearCache(namespace = process.env.CACHE_NAMESPACE || 'kuybi'): Promise<void> {
    if (!this.client) return
    const stream = this.client.scanStream({ match: `${namespace}:*`, count: 500 })
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) await this.client.unlink(...keys)
    }
  }

  /**
   * Get Redis client for testing
   */
  static getClient(): Redis {
    return this.client
  }
}
