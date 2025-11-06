import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { ModuleRef } from '@nestjs/core'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { QueueName } from '@core/queues/jobs/types'
import { DataSource } from 'typeorm'
import { InjectDataSource } from '@nestjs/typeorm'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'

/**
 * Centralized shutdown service for graceful cleanup of all resources
 *
 * Handles:
 * - BullMQ queue draining and closure
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
    private readonly dataSource: DataSource,
    @InjectQueue(QueueName.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QueueName.SESSION_CLEANUP) private readonly sessionCleanupQueue: Queue,
    @InjectQueue(QueueName.LOG_MAINTENANCE) private readonly logMaintenanceQueue: Queue,
    @InjectQueue(QueueName.ATTACHMENT_PROCESSING)
    private readonly attachmentProcessingQueue: Queue,
    @InjectQueue(QueueName.ACCOUNT_SECURITY) private readonly accountSecurityQueue: Queue
  ) {}

  /**
   * Called by NestJS when app.close() is triggered
   * This is part of the NestJS lifecycle
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.info({ signal }, 'ShutdownService: Starting application shutdown')

    const shutdownTasks = [
      this.drainQueues(),
      this.closeDatabaseConnections(),
      this.closeCacheConnections()
    ]

    try {
      await Promise.allSettled(shutdownTasks)
      this.logger.info({ signal }, 'ShutdownService: All shutdown tasks completed')
    } catch (error) {
      this.logger.error(
        { signal, error: error.message },
        'ShutdownService: Error during shutdown tasks'
      )
    }
  }

  /**
   * Drain and close all BullMQ queues
   * This ensures in-progress jobs are completed before shutdown
   */
  private async drainQueues(): Promise<void> {
    this.logger.info('ShutdownService: Draining BullMQ queues')

    const queues = [
      { name: 'email', queue: this.emailQueue },
      { name: 'session-cleanup', queue: this.sessionCleanupQueue },
      { name: 'log-maintenance', queue: this.logMaintenanceQueue },
      { name: 'attachment-processing', queue: this.attachmentProcessingQueue },
      { name: 'account-security', queue: this.accountSecurityQueue }
    ]

    for (const { name, queue } of queues) {
      try {
        // Pause the queue to prevent new jobs from being processed
        await queue.pause()
        this.logger.debug({ queue: name }, 'Queue paused')

        // Wait for active jobs to complete (with timeout)
        const activeCount = await queue.getActiveCount()
        if (activeCount > 0) {
          this.logger.info({ queue: name, activeCount }, 'Waiting for active jobs to complete')

          // Wait up to 5 seconds for jobs to complete
          const maxWait = 5000
          const startTime = Date.now()

          while ((await queue.getActiveCount()) > 0 && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }

          const remainingJobs = await queue.getActiveCount()
          if (remainingJobs > 0) {
            this.logger.warn(
              { queue: name, remainingJobs },
              'Queue still has active jobs after timeout'
            )
          }
        }

        // Close the queue connection
        await queue.close()
        this.logger.debug({ queue: name }, 'Queue closed successfully')
      } catch (error) {
        this.logger.error({ queue: name, error: error.message }, 'Error closing queue')
      }
    }

    this.logger.info('ShutdownService: All queues drained and closed')
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
        { error: error.message },
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

      if (cacheManager) {
        // cache-manager doesn't have a built-in close method for all stores
        // but the Redis store should close when the app shuts down
        this.logger.debug('ShutdownService: Cache manager found, cleanup will be handled by NestJS')
      } else {
        this.logger.debug('ShutdownService: No cache manager found')
      }
    } catch (error) {
      this.logger.warn({ error: error.message }, 'ShutdownService: Could not access cache manager')
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
