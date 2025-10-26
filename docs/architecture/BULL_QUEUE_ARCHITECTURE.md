# Bull Queue Enterprise Architecture - Susanoo NestJS

## Executive Summary

This document outlines a comprehensive enterprise-grade architecture for implementing **Bull queues** to offload all background jobs from the main NestJS application, transforming it into a pure request/response handler while delegating time-consuming operations to dedicated worker processes managed by PM2.

### Current State Analysis

**Identified Background Jobs:**
1. **Session Cleanup** - Runs every hour (`@Cron(CronExpression.EVERY_HOUR)`)
2. **Session Expiration Check** - Runs every 30 minutes
3. **Log Rotation** - Runs daily at midnight + interval-based checks
4. **Log Cleanup** - Daily archive cleanup
5. **Orphaned Attachments Cleanup** - (Planned, mentioned in docs)
6. **Security Scans** - (Future, for attachments)
7. **Email/SMS Notifications** - (Pending implementation)

### Proposed Architecture Benefits

✅ **Separation of Concerns**
- Main app handles only HTTP requests/responses
- Workers handle all time-consuming operations
- Clear boundaries between services

✅ **Scalability**
- Scale workers independently from API servers
- Add more workers for high-load jobs
- Different worker pools for different job types

✅ **Reliability**
- Job persistence in Redis
- Automatic retry with exponential backoff
- Dead letter queue for failed jobs
- Job priority and rate limiting

✅ **Observability**
- Centralized Bull Board dashboard
- Real-time job monitoring
- Performance metrics and analytics
- Failed job tracking and debugging

✅ **Resource Optimization**
- CPU-intensive jobs don't block API responses
- Better memory management
- Configurable concurrency per job type

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOAD BALANCER (NGINX)                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   API APP 1  │  │   API APP 2  │  │   API APP 3  │
│   (PM2)      │  │   (PM2)      │  │   (PM2)      │
│              │  │              │  │              │
│ - Routes     │  │ - Routes     │  │ - Routes     │
│ - Controllers│  │ - Controllers│  │ - Controllers│
│ - Services   │  │ - Services   │  │ - Services   │
│ - Enqueue    │  │ - Enqueue    │  │ - Enqueue    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └────────┬────────┴────────┬────────┘
                │                 │
                ▼                 ▼
         ┌──────────────────────────────┐
         │      REDIS (Bull Queues)     │
         │                              │
         │  - session-cleanup-queue     │
         │  - log-maintenance-queue     │
         │  - email-queue               │
         │  - attachment-processing     │
         │  - notification-queue        │
         └──────────────┬───────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  WORKER 1    │ │  WORKER 2    │ │  WORKER 3    │
│  (PM2)       │ │  (PM2)       │ │  (PM2)       │
│              │ │              │ │              │
│ - Session    │ │ - Logs       │ │ - Email/SMS  │
│   Cleanup    │ │   Rotation   │ │   Sending    │
│ - Security   │ │   Cleanup    │ │ - Push       │
│   Scans      │ │ - Archiving  │ │   Notifs     │
└──────────────┘ └──────────────┘ └──────────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                        ▼
                ┌──────────────┐
                │  BULL BOARD  │
                │  DASHBOARD   │
                │  (PM2)       │
                │              │
                │ - Monitor    │
                │ - Retry      │
                │ - Analytics  │
                └──────────────┘
```

---

## Detailed Design

### 1. Queue Structure

#### Queue Categories

```typescript
// Queue definitions
export enum QueueName {
  SESSION_CLEANUP = 'session-cleanup-queue',
  LOG_MAINTENANCE = 'log-maintenance-queue',
  EMAIL = 'email-queue',
  SMS = 'sms-queue',
  ATTACHMENT_PROCESSING = 'attachment-processing-queue',
  NOTIFICATION = 'notification-queue',
  SECURITY_SCAN = 'security-scan-queue',
  DATA_EXPORT = 'data-export-queue',
  REPORT_GENERATION = 'report-generation-queue',
}

// Job types per queue
export enum SessionCleanupJobType {
  CLEANUP_EXPIRED = 'cleanup-expired-sessions',
  CHECK_EXPIRING = 'check-expiring-sessions',
  CHECK_SUSPICIOUS = 'check-suspicious-sessions',
  REMOVE_ORPHANED = 'remove-orphaned-sessions',
}

export enum LogMaintenanceJobType {
  ROTATE_LOGS = 'rotate-logs',
  CLEANUP_ARCHIVES = 'cleanup-archives',
  SHIP_LOGS = 'ship-logs-remote',
  CHECK_SIZE = 'check-log-size',
}

export enum EmailJobType {
  SEND_WELCOME = 'send-welcome-email',
  SEND_PASSWORD_RESET = 'send-password-reset',
  SEND_NOTIFICATION = 'send-notification-email',
  SEND_BULK = 'send-bulk-email',
}

export enum AttachmentJobType {
  PROCESS_IMAGE = 'process-image',
  GENERATE_THUMBNAILS = 'generate-thumbnails',
  VIRUS_SCAN = 'virus-scan',
  CLEANUP_ORPHANED = 'cleanup-orphaned-files',
  EXTRACT_METADATA = 'extract-metadata',
}
```

#### Queue Configuration

```typescript
// src/queues/config/queue.config.ts
export const queueConfig = {
  // Redis connection (shared across all queues)
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_QUEUE_DB || '1'), // Separate DB for queues
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },

  // Default queue options
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2 seconds initial delay
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      count: 5000, // Keep last 5000 failed jobs
    },
  },

  // Queue-specific configurations
  queues: {
    [QueueName.SESSION_CLEANUP]: {
      limiter: {
        max: 100, // Max 100 jobs
        duration: 60000, // Per minute
      },
      defaultJobOptions: {
        priority: 5, // Medium-high priority
      },
    },
    [QueueName.LOG_MAINTENANCE]: {
      limiter: {
        max: 50,
        duration: 60000,
      },
      defaultJobOptions: {
        priority: 3, // Medium priority
      },
    },
    [QueueName.EMAIL]: {
      limiter: {
        max: 500, // Higher throughput for emails
        duration: 60000,
      },
      defaultJobOptions: {
        priority: 7, // High priority
        attempts: 5, // More retries for emails
      },
    },
    [QueueName.ATTACHMENT_PROCESSING]: {
      limiter: {
        max: 20, // CPU intensive, lower limit
        duration: 60000,
      },
      defaultJobOptions: {
        priority: 4,
        timeout: 300000, // 5 minutes timeout
      },
    },
  },
}
```

### 2. Project Structure

```
nest-app/
├── src/
│   ├── app.module.ts                      # Main app (NO @Cron decorators)
│   ├── main.ts                            # API server entry
│   ├── worker.ts                          # Worker entry (NEW)
│   ├── dashboard.ts                       # Bull Board entry (NEW)
│   │
│   ├── queues/                            # NEW: Queue infrastructure
│   │   ├── queues.module.ts              # Registers all queues
│   │   ├── config/
│   │   │   ├── queue.config.ts           # Queue configurations
│   │   │   └── worker.config.ts          # Worker configurations
│   │   │
│   │   ├── producers/                    # Job enqueuers (used by API)
│   │   │   ├── session-cleanup.producer.ts
│   │   │   ├── log-maintenance.producer.ts
│   │   │   ├── email.producer.ts
│   │   │   └── attachment.producer.ts
│   │   │
│   │   ├── processors/                   # Job processors (workers)
│   │   │   ├── session-cleanup.processor.ts
│   │   │   ├── log-maintenance.processor.ts
│   │   │   ├── email.processor.ts
│   │   │   └── attachment.processor.ts
│   │   │
│   │   ├── jobs/                         # Job definitions & types
│   │   │   ├── session-cleanup.jobs.ts
│   │   │   ├── log-maintenance.jobs.ts
│   │   │   └── types.ts
│   │   │
│   │   └── schedulers/                   # Cron-to-queue adapters
│   │       ├── session-cleanup.scheduler.ts
│   │       ├── log-maintenance.scheduler.ts
│   │       └── base.scheduler.ts
│   │
│   ├── auth/
│   │   └── services/
│   │       ├── session-cleanup.service.ts  # MODIFIED: Remove @Cron
│   │       └── sessions.service.ts
│   │
│   └── logging/
│       └── log-maintenance.service.ts      # MODIFIED: Remove @Cron
│
├── ecosystem.config.js                    # PM2 configuration (NEW)
├── package.json                           # Add Bull dependencies
└── README-QUEUES.md                       # Queue documentation (NEW)
```

### 3. Implementation Details

#### 3.1 Dependencies

```json
// package.json additions
{
  "dependencies": {
    "@nestjs/bull": "^10.2.1",
    "@nestjs/bullmq": "^10.2.1",          // Modern Bull alternative
    "bull": "^4.12.9",
    "bullmq": "^5.15.0",                   // Modern Bull (recommended)
    "@bull-board/api": "^6.3.0",
    "@bull-board/express": "^6.3.0",
    "@bull-board/nestjs": "^6.3.0"
  },
  "devDependencies": {
    "@types/bull": "^4.10.0"
  }
}
```

**Recommendation**: Use **BullMQ** (modern rewrite) instead of classic Bull for better performance and TypeScript support.

#### 3.2 Queue Module Setup

```typescript
// src/queues/queues.module.ts
import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { QueueName } from './jobs/types'

// Producers
import { SessionCleanupProducer } from './producers/session-cleanup.producer'
import { LogMaintenanceProducer } from './producers/log-maintenance.producer'
import { EmailProducer } from './producers/email.producer'

// Processors (only imported in worker mode)
import { SessionCleanupProcessor } from './processors/session-cleanup.processor'
import { LogMaintenanceProcessor } from './processors/log-maintenance.processor'
import { EmailProcessor } from './processors/email.processor'

// Schedulers (only for worker mode)
import { SessionCleanupScheduler } from './schedulers/session-cleanup.scheduler'
import { LogMaintenanceScheduler } from './schedulers/log-maintenance.scheduler'

const isWorkerMode = process.env.APP_MODE === 'worker'

@Module({
  imports: [
    // Register all queues with shared Redis connection
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
          db: configService.get('redis.queueDb', 1),
        },
      }),
      inject: [ConfigService],
    }),

    // Register individual queues
    BullModule.registerQueue(
      { name: QueueName.SESSION_CLEANUP },
      { name: QueueName.LOG_MAINTENANCE },
      { name: QueueName.EMAIL },
      { name: QueueName.ATTACHMENT_PROCESSING },
    ),
  ],
  providers: [
    // Producers (always available for API to enqueue jobs)
    SessionCleanupProducer,
    LogMaintenanceProducer,
    EmailProducer,

    // Processors (only in worker mode)
    ...(isWorkerMode
      ? [
          SessionCleanupProcessor,
          LogMaintenanceProcessor,
          EmailProcessor,
          SessionCleanupScheduler,
          LogMaintenanceScheduler,
        ]
      : []),
  ],
  exports: [
    SessionCleanupProducer,
    LogMaintenanceProducer,
    EmailProducer,
  ],
})
export class QueuesModule {}
```

#### 3.3 Producer Example (API Side)

```typescript
// src/queues/producers/session-cleanup.producer.ts
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { QueueName, SessionCleanupJobType } from '../jobs/types'

interface CleanupExpiredJobData {
  olderThanDays: number
  triggeredBy?: string
  reason?: string
}

@Injectable()
export class SessionCleanupProducer {
  constructor(
    @InjectQueue(QueueName.SESSION_CLEANUP)
    private readonly sessionCleanupQueue: Queue,
    
    @InjectPinoLogger(SessionCleanupProducer.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Enqueue session cleanup job
   * Called by SessionCleanupService (which no longer uses @Cron)
   */
  async scheduleCleanupExpired(data: CleanupExpiredJobData) {
    this.logger.info(
      { jobType: SessionCleanupJobType.CLEANUP_EXPIRED, data },
      'Enqueueing session cleanup job'
    )

    const job = await this.sessionCleanupQueue.add(
      SessionCleanupJobType.CLEANUP_EXPIRED,
      data,
      {
        priority: 5,
        removeOnComplete: { age: 3600, count: 100 },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    )

    this.logger.debug({ jobId: job.id }, 'Session cleanup job enqueued')
    return job
  }

  /**
   * Manual cleanup trigger (from API endpoint)
   */
  async triggerManualCleanup(olderThanDays: number, userId: string) {
    return this.scheduleCleanupExpired({
      olderThanDays,
      triggeredBy: userId,
      reason: 'manual',
    })
  }

  /**
   * Schedule check for expiring sessions
   */
  async scheduleCheckExpiring(withinMinutes: number = 60) {
    const job = await this.sessionCleanupQueue.add(
      SessionCleanupJobType.CHECK_EXPIRING,
      { withinMinutes },
      {
        priority: 6,
        removeOnComplete: { age: 1800 },
      }
    )

    this.logger.debug({ jobId: job.id }, 'Check expiring sessions job enqueued')
    return job
  }
}
```

#### 3.4 Processor Example (Worker Side)

```typescript
// src/queues/processors/session-cleanup.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { Job } from 'bullmq'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { SessionsService } from '../../auth/services/sessions.service'
import { SessionRepository } from '../../database/repositories/session.repository'
import { QueueName, SessionCleanupJobType } from '../jobs/types'

@Processor(QueueName.SESSION_CLEANUP, {
  concurrency: 5, // Process 5 jobs concurrently
  limiter: {
    max: 100,
    duration: 60000, // Max 100 jobs per minute
  },
})
@Injectable()
export class SessionCleanupProcessor extends WorkerHost {
  constructor(
    @InjectPinoLogger(SessionCleanupProcessor.name)
    private readonly logger: PinoLogger,
    
    private readonly sessionsService: SessionsService,
    private readonly sessionRepository: SessionRepository,
  ) {
    super()
  }

  async process(job: Job): Promise<any> {
    const startTime = Date.now()
    
    this.logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade + 1,
        data: job.data,
      },
      'Processing session cleanup job'
    )

    try {
      let result

      switch (job.name) {
        case SessionCleanupJobType.CLEANUP_EXPIRED:
          result = await this.handleCleanupExpired(job)
          break

        case SessionCleanupJobType.CHECK_EXPIRING:
          result = await this.handleCheckExpiring(job)
          break

        case SessionCleanupJobType.CHECK_SUSPICIOUS:
          result = await this.handleCheckSuspicious(job)
          break

        default:
          throw new Error(`Unknown job type: ${job.name}`)
      }

      const duration = Date.now() - startTime

      this.logger.info(
        {
          jobId: job.id,
          jobName: job.name,
          duration,
          result,
        },
        'Session cleanup job completed'
      )

      return result
    } catch (error) {
      this.logger.error(
        {
          jobId: job.id,
          jobName: job.name,
          error: error.message,
          stack: error.stack,
        },
        'Session cleanup job failed'
      )
      throw error // Bull will handle retries
    }
  }

  private async handleCleanupExpired(job: Job) {
    const { olderThanDays } = job.data
    
    const result = await this.sessionsService.cleanupExpiredSessions(
      olderThanDays
    )

    // Update job progress
    await job.updateProgress(100)

    return result
  }

  private async handleCheckExpiring(job: Job) {
    const { withinMinutes } = job.data
    
    const expiringSoon = await this.sessionRepository.findExpiringSoon(
      withinMinutes
    )

    if (expiringSoon.length > 0) {
      this.logger.warn(
        { count: expiringSoon.length, withinMinutes },
        'Sessions expiring soon'
      )
    }

    return { checked: expiringSoon.length }
  }

  private async handleCheckSuspicious(job: Job) {
    const suspicious = await this.sessionRepository.findSuspiciousSessions()

    if (suspicious.length > 0) {
      this.logger.warn(
        { count: suspicious.length },
        'Suspicious sessions detected'
      )
    }

    return { suspicious: suspicious.length }
  }
}
```

#### 3.5 Scheduler (Cron-to-Queue Adapter)

```typescript
// src/queues/schedulers/session-cleanup.scheduler.ts
import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { SessionCleanupProducer } from '../producers/session-cleanup.producer'

/**
 * Scheduler that runs ONLY in worker mode
 * Converts cron schedules to queue jobs
 */
@Injectable()
export class SessionCleanupScheduler {
  constructor(
    @InjectPinoLogger(SessionCleanupScheduler.name)
    private readonly logger: PinoLogger,
    
    private readonly sessionCleanupProducer: SessionCleanupProducer,
  ) {}

  /**
   * Schedule hourly session cleanup
   * Replaces the @Cron decorator from SessionCleanupService
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduleHourlyCleanup() {
    this.logger.info('Scheduling hourly session cleanup job')
    
    try {
      await this.sessionCleanupProducer.scheduleCleanupExpired({
        olderThanDays: 30,
        reason: 'scheduled_hourly',
      })
    } catch (error) {
      this.logger.error(
        { error: error.message },
        'Failed to schedule cleanup job'
      )
    }
  }

  /**
   * Schedule check for expiring sessions every 30 minutes
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduleExpiringCheck() {
    this.logger.info('Scheduling expiring sessions check')
    
    try {
      await this.sessionCleanupProducer.scheduleCheckExpiring(60)
    } catch (error) {
      this.logger.error(
        { error: error.message },
        'Failed to schedule expiring check'
      )
    }
  }
}
```

#### 3.6 Worker Entry Point

```typescript
// src/worker.ts
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { PinoLogger } from 'nestjs-pino'

async function bootstrap() {
  // Set environment to worker mode
  process.env.APP_MODE = 'worker'

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  })

  const logger = app.get(PinoLogger)
  app.useLogger(logger)

  logger.log('🔧 Starting Bull Queue Worker...')
  logger.log(`Worker PID: ${process.pid}`)
  logger.log(`Node environment: ${process.env.NODE_ENV}`)

  // Workers don't need HTTP server
  // They just process jobs from queues
  await app.init()

  logger.log('✅ Worker is ready and processing jobs')
}

bootstrap()
```

#### 3.7 Bull Board Dashboard

```typescript
// src/dashboard.ts
import { NestFactory } from '@nestjs/core'
import { ExpressAdapter } from '@bull-board/express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { Queue } from 'bullmq'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import * as express from 'express'
import * as basicAuth from 'express-basic-auth'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)

  // Create queues (same config as main app)
  const connection = {
    host: configService.get('redis.host'),
    port: configService.get('redis.port'),
    password: configService.get('redis.password'),
    db: configService.get('redis.queueDb', 1),
  }

  const queues = [
    new Queue('session-cleanup-queue', { connection }),
    new Queue('log-maintenance-queue', { connection }),
    new Queue('email-queue', { connection }),
    new Queue('attachment-processing-queue', { connection }),
  ]

  // Create Bull Board
  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath('/admin/queues')

  createBullBoard({
    queues: queues.map(queue => new BullMQAdapter(queue)),
    serverAdapter,
  })

  const dashboardApp = express()

  // Add basic auth protection
  const username = configService.get('bullBoard.username', 'admin')
  const password = configService.get('bullBoard.password', 'admin123')

  dashboardApp.use(
    '/admin/queues',
    basicAuth({
      users: { [username]: password },
      challenge: true,
    })
  )

  dashboardApp.use('/admin/queues', serverAdapter.getRouter())

  const port = configService.get('bullBoard.port', 3001)
  dashboardApp.listen(port, () => {
    console.log(`📊 Bull Board dashboard running at http://localhost:${port}/admin/queues`)
    console.log(`   Username: ${username}`)
    console.log(`   Password: ${password}`)
  })
}

bootstrap()
```

### 4. PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    // ============================================
    // API SERVERS (Request/Response Only)
    // ============================================
    {
      name: 'api-server',
      script: './dist/main.js',
      instances: 4, // Use 4 CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        APP_MODE: 'api',
        PORT: 4040,
      },
      error_file: './logs/pm2/api-error.log',
      out_file: './logs/pm2/api-out.log',
      merge_logs: true,
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
    },

    // ============================================
    // QUEUE WORKERS (Background Jobs)
    // ============================================
    {
      name: 'worker-session-cleanup',
      script: './dist/worker.js',
      instances: 2, // 2 workers for session cleanup
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        APP_MODE: 'worker',
        WORKER_TYPE: 'session-cleanup',
      },
      error_file: './logs/pm2/worker-session-error.log',
      out_file: './logs/pm2/worker-session-out.log',
      merge_logs: true,
      max_memory_restart: '512M',
    },

    {
      name: 'worker-log-maintenance',
      script: './dist/worker.js',
      instances: 1, // Single worker for log maintenance
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        APP_MODE: 'worker',
        WORKER_TYPE: 'log-maintenance',
      },
      error_file: './logs/pm2/worker-log-error.log',
      out_file: './logs/pm2/worker-log-out.log',
      max_memory_restart: '512M',
    },

    {
      name: 'worker-email',
      script: './dist/worker.js',
      instances: 3, // 3 workers for high email throughput
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        APP_MODE: 'worker',
        WORKER_TYPE: 'email',
      },
      error_file: './logs/pm2/worker-email-error.log',
      out_file: './logs/pm2/worker-email-out.log',
      max_memory_restart: '512M',
    },

    {
      name: 'worker-attachment',
      script: './dist/worker.js',
      instances: 2, // 2 workers for CPU-intensive image processing
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        APP_MODE: 'worker',
        WORKER_TYPE: 'attachment',
      },
      error_file: './logs/pm2/worker-attachment-error.log',
      out_file: './logs/pm2/worker-attachment-out.log',
      max_memory_restart: '1G', // Higher memory for image processing
    },

    // ============================================
    // BULL BOARD DASHBOARD
    // ============================================
    {
      name: 'bull-board',
      script: './dist/dashboard.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/pm2/dashboard-error.log',
      out_file: './logs/pm2/dashboard-out.log',
      max_memory_restart: '256M',
    },
  ],
}
```

### 5. Migration Strategy

#### Phase 1: Infrastructure Setup (Week 1)

**Day 1-2: Install Dependencies**
```bash
npm install @nestjs/bullmq bullmq @bull-board/api @bull-board/express @bull-board/nestjs
npm install --save-dev @types/bull
```

**Day 3-4: Create Queue Module**
- Create `src/queues/` directory structure
- Implement `QueuesModule` with basic configuration
- Set up Redis connection for queues (separate DB)
- Create base producer and processor classes

**Day 5: Bull Board Dashboard**
- Implement `src/dashboard.ts`
- Set up basic auth
- Test with dummy queue

#### Phase 2: Migrate Session Cleanup (Week 2)

**Day 1-2: Create Queue Infrastructure**
- Implement `SessionCleanupProducer`
- Implement `SessionCleanupProcessor`
- Create `SessionCleanupScheduler`

**Day 3: Refactor Service**
- Remove `@Cron` decorators from `SessionCleanupService`
- Replace direct execution with producer calls
- Update service to be queue-aware

**Day 4-5: Testing**
- Unit tests for producer/processor
- Integration tests with Redis
- Performance testing
- Monitor with Bull Board

#### Phase 3: Migrate Log Maintenance (Week 3)

Follow same pattern as Session Cleanup:
- Create `LogMaintenanceProducer`
- Create `LogMaintenanceProcessor`
- Create `LogMaintenanceScheduler`
- Refactor `LogMaintenanceService`
- Test thoroughly

#### Phase 4: PM2 Setup (Week 4)

**Day 1-2: Worker Entry Points**
- Implement `src/worker.ts`
- Implement worker selection logic
- Test worker modes

**Day 3-4: PM2 Configuration**
- Create `ecosystem.config.js`
- Configure all apps (API + workers + dashboard)
- Set up log rotation for PM2
- Configure auto-restart strategies

**Day 5: Deployment Testing**
- Test with PM2 locally
- Verify all workers process jobs
- Monitor dashboard
- Load testing

#### Phase 5: Add New Queues (Week 5)

- Email/SMS queue
- Attachment processing queue
- Notification queue
- Security scan queue

### 6. Monitoring & Operations

#### 6.1 Metrics to Track

```typescript
// src/queues/metrics/queue-metrics.service.ts
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

@Injectable()
export class QueueMetricsService {
  constructor(
    @InjectQueue('session-cleanup-queue')
    private readonly sessionQueue: Queue,
  ) {}

  async getQueueMetrics(queueName: string) {
    const queue = this[`${queueName}Queue`]
    
    const [
      waiting,
      active,
      completed,
      failed,
      delayed,
    ] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ])

    return {
      queueName,
      jobs: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      },
      timestamp: new Date().toISOString(),
    }
  }

  async getAllMetrics() {
    // Collect metrics from all queues
    // Export to Prometheus/DataDog
  }
}
```

#### 6.2 Health Checks

```typescript
// src/health/queue-health.indicator.ts
import { Injectable } from '@nestjs/common'
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'

@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(
    @InjectQueue('session-cleanup-queue')
    private readonly sessionQueue: Queue,
  ) {
    super()
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const activeCount = await this.sessionQueue.getActiveCount()
    const failedCount = await this.sessionQueue.getFailedCount()

    const isHealthy = activeCount < 100 && failedCount < 50

    const result = this.getStatus(key, isHealthy, {
      active: activeCount,
      failed: failedCount,
    })

    if (isHealthy) {
      return result
    }
    throw new HealthCheckError('Queue health check failed', result)
  }
}
```

### 7. Best Practices

#### 7.1 Job Design Principles

✅ **Idempotent Jobs**: Jobs should be safe to retry
```typescript
// BAD: Not idempotent
async cleanupSession(sessionId: string) {
  await this.sessionRepo.delete(sessionId)
  await this.cacheService.delete(sessionId)
  // If cache delete fails, retry will fail (session already deleted)
}

// GOOD: Idempotent
async cleanupSession(sessionId: string) {
  const session = await this.sessionRepo.findById(sessionId)
  if (!session) return { alreadyDeleted: true }
  
  await this.sessionRepo.delete(sessionId)
  await this.cacheService.delete(sessionId).catch(() => {})
  return { deleted: true }
}
```

✅ **Small Job Payloads**: Keep data minimal
```typescript
// BAD: Large payload
await queue.add('process-image', {
  image: Buffer.from(...), // Large binary data
  metadata: { ... }
})

// GOOD: Reference only
await queue.add('process-image', {
  attachmentId: 'uuid-here', // Fetch from DB in processor
  operations: ['resize', 'thumbnail']
})
```

✅ **Proper Error Handling**
```typescript
async process(job: Job) {
  try {
    // Business logic
  } catch (error) {
    if (error.code === 'TRANSIENT_ERROR') {
      throw error // Let Bull retry
    } else {
      // Log permanent error, don't retry
      this.logger.error('Permanent error, moving to failed', error)
      await job.moveToFailed(error, true)
    }
  }
}
```

#### 7.2 Concurrency Guidelines

```typescript
// CPU-bound tasks: Low concurrency
@Processor('attachment-processing', {
  concurrency: 2, // Max 2 concurrent image processing jobs
})

// I/O-bound tasks: Higher concurrency
@Processor('email', {
  concurrency: 10, // Can send 10 emails concurrently
})

// Database-heavy: Medium concurrency
@Processor('session-cleanup', {
  concurrency: 5, // 5 concurrent DB operations
})
```

#### 7.3 Rate Limiting

```typescript
// Prevent overwhelming external APIs
{
  name: QueueName.EMAIL,
  limiter: {
    max: 500,      // Max 500 emails
    duration: 60000, // Per minute
    bounceBack: true, // Re-queue if limit exceeded
  }
}
```

### 8. Cost-Benefit Analysis

#### Current State (In-Process Crons)

❌ **Cons:**
- API responses blocked by background jobs
- No job persistence (data loss on crash)
- Can't scale workers independently
- Hard to monitor job execution
- No automatic retries
- Memory leaks from long-running jobs
- Single point of failure

✅ **Pros:**
- Simple to implement
- No additional infrastructure

#### Proposed State (Bull Queues + PM2)

✅ **Pros:**
- **Performance**: API server only handles requests (< 50ms response time)
- **Reliability**: Jobs persist in Redis, survive crashes
- **Scalability**: Scale workers independently (10x email workers vs 2x log workers)
- **Observability**: Real-time dashboard, metrics, logging
- **Resilience**: Automatic retries, dead letter queue
- **Resource Optimization**: Dedicated workers for CPU-intensive tasks
- **Deployment Flexibility**: Deploy API and workers separately

❌ **Cons:**
- Additional complexity (more moving parts)
- Redis dependency (already have it)
- More processes to monitor (PM2 handles this)
- Slightly higher memory footprint (PM2 clustering)

### 9. Deployment Checklist

#### Pre-Deployment

- [ ] Install Bull dependencies
- [ ] Set up separate Redis DB for queues (DB 1)
- [ ] Create all queue infrastructure
- [ ] Implement producers for all jobs
- [ ] Implement processors for all jobs
- [ ] Create schedulers (cron-to-queue adapters)
- [ ] Remove `@Cron` decorators from services
- [ ] Create worker entry point (`worker.ts`)
- [ ] Create dashboard entry point (`dashboard.ts`)
- [ ] Write unit tests for producers/processors
- [ ] Write integration tests with Redis
- [ ] Create `ecosystem.config.js` for PM2
- [ ] Update environment variables
- [ ] Document queue architecture

#### Deployment

- [ ] Build application (`npm run build`)
- [ ] Install PM2 globally (`npm install -g pm2`)
- [ ] Start all apps (`pm2 start ecosystem.config.js`)
- [ ] Verify API servers are running
- [ ] Verify workers are processing jobs
- [ ] Verify dashboard is accessible
- [ ] Set up PM2 log rotation (`pm2 install pm2-logrotate`)
- [ ] Configure PM2 startup script (`pm2 startup`)
- [ ] Save PM2 process list (`pm2 save`)

#### Post-Deployment Monitoring

- [ ] Monitor Bull Board dashboard
- [ ] Check failed jobs queue
- [ ] Monitor worker CPU/memory usage
- [ ] Verify cron jobs are creating queue jobs
- [ ] Test manual job triggering via API
- [ ] Monitor Redis memory usage
- [ ] Set up alerts for failed jobs
- [ ] Review PM2 logs

### 10. Recommended Timeline

**Total: 5-6 weeks**

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Infrastructure | Queue module, Bull Board, basic tests |
| 2 | Session Cleanup | Producer, processor, scheduler, tests |
| 3 | Log Maintenance | Producer, processor, scheduler, tests |
| 4 | PM2 Setup | Worker entry, ecosystem config, deployment |
| 5 | New Queues | Email, attachments, notifications |
| 6 | Polish & Docs | Monitoring, alerts, documentation |

---

## Conclusion

This architecture provides:

1. **Clean Separation**: API handles requests, workers handle jobs
2. **Enterprise-Grade**: Bull + PM2 is battle-tested in production
3. **Scalability**: Scale each component independently
4. **Observability**: Real-time dashboard and metrics
5. **Reliability**: Job persistence, retries, dead letter queue
6. **Resource Efficiency**: Optimized CPU/memory usage

**Recommendation**: Start with **Phase 1-2** (Session Cleanup migration) as proof of concept, then proceed with remaining phases.

The investment in this architecture pays off immediately with better performance, reliability, and developer experience. Your API will be pure request/response, and all heavy lifting happens in dedicated, scalable workers.
