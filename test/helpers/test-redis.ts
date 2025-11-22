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
   * Clear all keys in test database
   */
  static async clearCache(): Promise<void> {
    if (this.client) {
      await this.client.flushdb()
    }
  }

  /**
   * Get Redis client for testing
   */
  static getClient(): Redis {
    return this.client
  }
}
