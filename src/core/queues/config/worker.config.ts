/**
 * Worker Configuration
 * Settings for queue worker processes
 */
export const workerConfig = {
  // Worker concurrency settings (how many jobs to process simultaneously)
  concurrency: {
    sessionCleanup: 5, // 5 concurrent session cleanup jobs
    logMaintenance: 2, // 2 concurrent log operations
    email: 10, // 10 concurrent email sends
    sms: 5, // 5 concurrent SMS sends
    attachmentProcessing: 2, // 2 concurrent image processing (CPU bound)
    notification: 8, // 8 concurrent notifications
    securityScan: 1, // 1 at a time (very CPU intensive)
    dataExport: 1, // 1 at a time (memory intensive)
    reportGeneration: 3 // 3 concurrent report generations
  },

  // Worker process settings
  process: {
    // Graceful shutdown timeout
    shutdownTimeout: 30000, // 30 seconds

    // Health check interval
    healthCheckInterval: 60000, // 1 minute

    // Metrics collection interval
    metricsInterval: 30000 // 30 seconds
  },

  // Retry strategy
  retry: {
    // Exponential backoff multiplier
    backoffMultiplier: 2,

    // Maximum backoff time
    maxBackoff: 300000, // 5 minutes

    // Jitter to prevent thundering herd
    jitter: true
  },

  // Failed job handling
  failedJobs: {
    // Move to dead letter queue after max attempts
    deadLetterQueue: true,

    // Keep failed jobs for debugging
    retentionDays: 7,

    // Alert on failed jobs
    alertThreshold: 10 // Alert if more than 10 jobs fail
  }
}

/**
 * Get worker concurrency for specific queue
 */
export function getWorkerConcurrency(workerType: string): number {
  const concurrencyMap: Record<string, number> = {
    'session-cleanup': workerConfig.concurrency.sessionCleanup,
    'log-maintenance': workerConfig.concurrency.logMaintenance,
    email: workerConfig.concurrency.email,
    sms: workerConfig.concurrency.sms,
    'attachment-processing': workerConfig.concurrency.attachmentProcessing,
    notification: workerConfig.concurrency.notification,
    'security-scan': workerConfig.concurrency.securityScan,
    'data-export': workerConfig.concurrency.dataExport,
    'report-generation': workerConfig.concurrency.reportGeneration
  }

  return concurrencyMap[workerType] || 1
}
