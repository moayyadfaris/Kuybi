import { QueueName } from '../jobs/types'

/**
 * Queue Configuration
 * Centralized configuration for all Bull queues
 */
export const queueConfig = {
  // Redis connection configuration (shared across all queues)
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_QUEUE_DB || '1'), // Separate DB for queues
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  },

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

  // Queue-specific configurations
  queues: {
    // Session Cleanup Queue
    [QueueName.SESSION_CLEANUP]: {
      limiter: {
        max: 100, // Max 100 jobs
        duration: 60000 // Per minute
      },
      defaultJobOptions: {
        priority: 5, // Medium-high priority
        attempts: 3
      }
    },

    // Log Maintenance Queue
    [QueueName.LOG_MAINTENANCE]: {
      limiter: {
        max: 50,
        duration: 60000
      },
      defaultJobOptions: {
        priority: 3, // Medium priority
        attempts: 2 // Less critical, fewer retries
      }
    },

    // Email Queue (High throughput)
    [QueueName.EMAIL]: {
      limiter: {
        max: 500, // Higher throughput for emails
        duration: 60000
      },
      defaultJobOptions: {
        priority: 7, // High priority
        attempts: 5, // More retries for emails
        backoff: {
          type: 'exponential' as const,
          delay: 5000 // 5 seconds initial delay
        }
      }
    },

    // SMS Queue (Rate limited by provider)
    [QueueName.SMS]: {
      limiter: {
        max: 100, // Typical SMS provider limit
        duration: 60000
      },
      defaultJobOptions: {
        priority: 8, // Higher priority than email
        attempts: 3
      }
    },

    // Attachment Processing Queue (CPU intensive)
    [QueueName.ATTACHMENT_PROCESSING]: {
      limiter: {
        max: 20, // CPU intensive, lower limit
        duration: 60000
      },
      defaultJobOptions: {
        priority: 4,
        timeout: 300000, // 5 minutes timeout
        attempts: 2 // Less retries for heavy jobs
      }
    },

    // Notification Queue
    [QueueName.NOTIFICATION]: {
      limiter: {
        max: 200,
        duration: 60000
      },
      defaultJobOptions: {
        priority: 6,
        attempts: 3
      }
    },

    // Security Scan Queue (Low priority, high resource)
    [QueueName.SECURITY_SCAN]: {
      limiter: {
        max: 10, // Very resource intensive
        duration: 60000
      },
      defaultJobOptions: {
        priority: 2, // Low priority
        timeout: 600000, // 10 minutes timeout
        attempts: 1 // Don't retry scans
      }
    },

    // Data Export Queue (Long running)
    [QueueName.DATA_EXPORT]: {
      limiter: {
        max: 5, // Very resource intensive
        duration: 60000
      },
      defaultJobOptions: {
        priority: 1, // Low priority
        timeout: 1800000, // 30 minutes timeout
        attempts: 2
      }
    },

    // Report Generation Queue
    [QueueName.REPORT_GENERATION]: {
      limiter: {
        max: 30,
        duration: 60000
      },
      defaultJobOptions: {
        priority: 4,
        timeout: 180000, // 3 minutes timeout
        attempts: 2
      }
    }
  }
}

/**
 * Helper to get queue-specific configuration
 */
export function getQueueConfig(queueName: QueueName) {
  return {
    connection: queueConfig.connection,
    ...queueConfig.queues[queueName],
    defaultJobOptions: {
      ...queueConfig.defaultJobOptions,
      ...queueConfig.queues[queueName]?.defaultJobOptions
    }
  }
}
