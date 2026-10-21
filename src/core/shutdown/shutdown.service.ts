import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { InjectDataSource } from '@nestjs/typeorm'
import { errorMessage } from '@shared/utils/error.util'
import { Cache } from 'cache-manager'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { DataSource } from 'typeorm'

/**
 * Centralized shutdown service for graceful cleanup of all resources
 *
 * Handles:
 * - Database connection cleanup
 * - Redis cache connection cleanup
 * - Any other cleanup tasks
 */
@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    @InjectPinoLogger(ShutdownService.name)
    private readonly logger: PinoLogger,
    private readonly moduleRef: ModuleRef,
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  /**
   * Called by NestJS when app.close() is triggered
   * This is part of the NestJS lifecycle
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.info({ signal }, 'ShutdownService: Starting application shutdown')

    // BullMQ is not handled here: @nestjs/bullmq closes each worker on shutdown
    // (worker.close() waits for that worker's active jobs) and then its queue. Never
    // queue.pause() on shutdown: that pauses the queue in Redis for every process and
    // stays paused after this one exits.
    const shutdownTasks = [this.closeDatabaseConnections(), this.closeCacheConnections()]

    try {
      await Promise.allSettled(shutdownTasks)
      this.logger.info({ signal }, 'ShutdownService: All shutdown tasks completed')
    } catch (error) {
      this.logger.error(
        { signal, error: errorMessage(error) },
        'ShutdownService: Error during shutdown tasks'
      )
    }
  }

  /**
   * Close database connections
   */
  private async closeDatabaseConnections(): Promise<void> {
    this.logger.info('ShutdownService: Closing database connections')

    try {
      if (this.dataSource && this.dataSource.isInitialized) {
        await this.dataSource.destroy()
        this.logger.info('ShutdownService: Database connections closed')
      } else {
        this.logger.debug('ShutdownService: Database already closed or not initialized')
      }
    } catch (error) {
      this.logger.error(
        { error: errorMessage(error) },
        'ShutdownService: Error closing database connections'
      )
    }
  }

  /**
   * Close Redis cache connections
   */
  private async closeCacheConnections(): Promise<void> {
    this.logger.info('ShutdownService: Closing cache connections')

    try {
      const cacheManager = this.moduleRef.get<Cache>(CACHE_MANAGER, { strict: false })

      // Closes the Redis connection of every store
      await cacheManager?.disconnect()
      this.logger.info('ShutdownService: Cache connections closed')
    } catch (error) {
      this.logger.warn(
        { error: errorMessage(error) },
        'ShutdownService: Could not access cache manager'
      )
    }
  }

  /**
   * Force shutdown after timeout (called by main.ts)
   */
  static async forceShutdown(timeoutMs: number, logger: PinoLogger): Promise<void> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        logger.error({ timeout: timeoutMs }, 'Graceful shutdown timeout - forcing exit')
        reject(new Error('Shutdown timeout'))
      }, timeoutMs)
    })
  }
}
