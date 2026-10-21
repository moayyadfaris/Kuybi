import type { RedisOptions } from 'ioredis'

import { QueueName } from '../jobs/types'

/**
 * Queue settings: the Redis connection fallbacks, default job options and per-queue job
 * options (retries, backoff, retention). Rate limits are worker settings in BullMQ, set on
 * the processor that needs one (@Processor(..., { limiter })); BullMQ has no job timeout
 * option, so a processor that must not run long enforces its own time budget.
 */
export const queueConfig = {
  // Redis connection configuration (shared across all queues)
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_QUEUE_DB || '1'), // Separate DB for queues
    maxRetriesPerRequest: null as number | null, // required by BullMQ for blocking commands
    enableReadyCheck: false
  } satisfies RedisOptions,

  // Default job options applied to all queues
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential' as const,
      delay: 2000 // 2 seconds initial delay, doubles each retry
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000 // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      count: 5000 // Keep last 5000 failed jobs
    }
  },

  // Queue-specific job options (each queue has a processor in the worker)
  queues: {
    // Jobs that failed their last attempt (BaseProcessor); kept until handled by hand
    [QueueName.DEAD_LETTER]: {
      defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false }
    },
    [QueueName.SESSION_CLEANUP]: { defaultJobOptions: { attempts: 3 } },
    [QueueName.EMAIL]: {
      defaultJobOptions: {
        attempts: 5, // More retries for emails
        backoff: { type: 'exponential' as const, delay: 5000 }
      }
    },
    [QueueName.ATTACHMENT_PROCESSING]: {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5000 }
      }
    },
    [QueueName.VERSION_CLEANUP]: { defaultJobOptions: { attempts: 2 } },
    [QueueName.CONTENT_PUBLISHING]: { defaultJobOptions: { attempts: 2 } },
    [QueueName.AUDIT_RETENTION]: { defaultJobOptions: { attempts: 2 } },
    [QueueName.ACCOUNT_SECURITY]: {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 5000 }
      }
    }
  }
}
