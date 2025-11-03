# Bull Queue Implementation - Documentation Index

## Overview

This directory contains all documentation for the Bull Queue implementation in the Kuybi NestJS application. The implementation follows a phased approach to migrate all background jobs from in-process cron jobs to dedicated queue workers.

## Quick Links

### 📚 Core Documentation
- **[Architecture Document](../architecture/BULL_QUEUE_ARCHITECTURE.md)** - Complete enterprise architecture design
- **[Phase 1 Complete](./PHASE_1_COMPLETE.md)** - Infrastructure setup summary
- **[Attachment Processing Queue](./ATTACHMENT_PROCESSING_QUEUE.md)** - Image processing implementation
- **[Version Cleanup Queue](./VERSION_CLEANUP_QUEUE.md)** - Story version lifecycle management

### 🚀 Getting Started
1. Read the [Architecture Document](../architecture/BULL_QUEUE_ARCHITECTURE.md)
2. Review [Phase 1 Complete](./PHASE_1_COMPLETE.md)
3. Start the [Bull Board Dashboard](../../src/queues/README.md#start-the-dashboard)

## Implementation Phases

### ✅ Phase 1: Infrastructure Setup (COMPLETE)
**Duration:** 2 hours  
**Status:** ✅ Complete  
**Date:** October 26, 2025

**Deliverables:**
- Bull dependencies installed
- 9 queues registered
- Bull Board dashboard operational
- Configuration complete
- Documentation complete

**Documentation:**
- [Phase 1 Summary](./PHASE_1_COMPLETE.md)
- [Queue README](../../src/queues/README.md)

---

### 🔄 Phase 2: Session Cleanup Migration (IN PROGRESS)
**Duration:** 2-3 days  
**Status:** 🚧 In Progress

**Completed:**
- SessionCleanupProcessor & Scheduler running inside worker
- Worker bootstrap (`worker.ts`) + PM2 entry

**Remaining Scope:**
- Create SessionCleanupProducer
- Remove `@Cron` from SessionCleanupService
- End-to-end testing

**Documentation:** [Queue README](../../src/queues/README.md)

---

### 📅 Phase 3: Log Maintenance Migration
**Duration:** 2-3 days  
**Status:** ⏳ Pending

**Scope:**
- Create LogMaintenanceProducer
- Create LogMaintenanceProcessor
- Create LogMaintenanceScheduler
- Remove @Cron from LogMaintenanceService
- Testing

**Documentation:** TBD

---

### 🔧 Phase 4: PM2 Setup & Worker Deployment
**Duration:** 3-4 days  
**Status:** ⏳ Pending

**Scope:**
- Worker entry point (worker.ts)
- PM2 ecosystem configuration
- Worker process management
- Load testing
- Production deployment

**Documentation:** TBD

---

### 📧 Phase 5: Additional Queues
**Duration:** 1 week  
**Status:** ⏳ Pending

**Scope:**
- Email queue implementation
- SMS queue implementation
- Attachment processing queue
- Notification queue
- Security scan queue (future)

**Documentation:** TBD

## File Structure

```
docs/
├── architecture/
│   └── BULL_QUEUE_ARCHITECTURE.md    # Complete architecture design
├── queues/
│   ├── INDEX.md                       # This file
│   ├── PHASE_1_COMPLETE.md           # Phase 1 summary
│   ├── PHASE_2_SUMMARY.md            # TBD - Session cleanup
│   ├── PHASE_3_SUMMARY.md            # TBD - Log maintenance
│   ├── PHASE_4_SUMMARY.md            # TBD - PM2 & workers
│   └── PHASE_5_SUMMARY.md            # TBD - Additional queues

src/queues/
├── README.md                          # Technical implementation guide
├── config/
│   ├── queue.config.ts               # Queue configurations
│   └── worker.config.ts              # Worker concurrency settings
├── jobs/
│   └── types.ts                      # Queue names, job types
├── producers/                        # Job enqueuers (Phase 2+)
├── processors/                       # Job handlers (Phase 2+)
├── schedulers/                       # Cron-to-queue adapters (Phase 2+)
└── queues.module.ts                  # Main module
```

## Access Points

### Bull Board Dashboard
- **URL:** http://localhost:3001/admin/queues
- **Username:** admin (configurable via `BULL_BOARD_USERNAME`)
- **Password:** admin123 (configurable via `BULL_BOARD_PASSWORD`)
- **Health:** http://localhost:3001/health

### Scripts
```bash
# Start dashboard (development)
npm run start:dashboard:dev

# Start dashboard (production)
npm run start:dashboard

# Start main API
npm run start:dev

# Future: Start workers
npm run start:worker:dev  # Phase 4
```

## Registered Queues

| Queue | Purpose | Status | Docs |
|-------|---------|--------|------|
| attachment-processing-queue | Image processing, thumbnails | ✅ Active | [📄](./ATTACHMENT_PROCESSING_QUEUE.md) |
| version-cleanup-queue | Story version lifecycle | ✅ Active | [📄](./VERSION_CLEANUP_QUEUE.md) |
| session-cleanup-queue | Session lifecycle management | ✅ Active | - |
| log-maintenance-queue | Log rotation and cleanup | ✅ Active | - |
| email-queue | Email notifications | ✅ Registered | - |
| sms-queue | SMS notifications | ✅ Registered | - |
| notification-queue | Push & in-app notifications | ✅ Registered | - |
| security-scan-queue | Virus scanning, security checks | ✅ Registered | - |
| data-export-queue | GDPR exports, data dumps | ✅ Registered | - |
| report-generation-queue | Analytics and reports | ✅ Registered | - |

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost          # Default: localhost
REDIS_PORT=6379              # Default: 6379
REDIS_PASSWORD=               # Optional
REDIS_DB=0                   # Cache DB (default: 0)
REDIS_QUEUE_DB=1             # Queue DB (default: 1)

# Bull Board Dashboard
BULL_BOARD_USERNAME=admin    # Default: admin
BULL_BOARD_PASSWORD=admin123 # Default: admin123
BULL_BOARD_PORT=3001         # Default: 3001

# Worker Configuration (Phase 4)
APP_MODE=api                 # api | worker
WORKER_TYPE=                 # session-cleanup | log-maintenance | etc.
```

### Queue Configuration

See [queue.config.ts](../../src/queues/config/queue.config.ts) for:
- Rate limits per queue
- Retry strategies
- Job priorities
- Timeout settings
- Retention policies

### Worker Configuration

See [worker.config.ts](../../src/queues/config/worker.config.ts) for:
- Concurrency settings
- Health check intervals
- Shutdown timeouts
- Failed job handling

## Architecture Summary

```
┌─────────────────────┐
│   API Servers       │  Pure request/response
│   (PM2 Cluster)     │  No background jobs
└──────────┬──────────┘
           │
           ├──────────────┐
           │              │
           ▼              ▼
    ┌────────────┐  ┌────────────┐
    │   Redis    │  │ PostgreSQL │
    │  (Queues)  │  │   (Data)   │
    └──────┬─────┘  └────────────┘
           │
     ┌─────┴─────┬─────────┬──────────┐
     │           │         │          │
     ▼           ▼         ▼          ▼
┌─────────┐ ┌─────────┐ ┌──────┐ ┌────────┐
│Worker 1 │ │Worker 2 │ │ ...  │ │Dashboard│
│Sessions │ │  Logs   │ │      │ │  UI    │
└─────────┘ └─────────┘ └──────┘ └────────┘
```

## Benefits

### Performance
- ✅ API response times < 50ms (no blocking)
- ✅ Background jobs isolated from HTTP requests
- ✅ Resource-optimized worker processes

### Reliability
- ✅ Job persistence in Redis
- ✅ Automatic retries with exponential backoff
- ✅ Dead letter queue for failed jobs
- ✅ Graceful shutdown handling

### Scalability
- ✅ Independent worker scaling
- ✅ Queue-specific rate limiting
- ✅ Priority-based job processing
- ✅ Multiple workers per queue type

### Observability
- ✅ Real-time dashboard monitoring
- ✅ Job history and statistics
- ✅ Failed job inspection
- ✅ Performance metrics

## Monitoring

### Bull Board Features
- Real-time queue status
- Job details and payloads
- Retry failed jobs
- Remove stuck jobs
- Queue statistics
- Job search and filtering

### Health Checks
```bash
# Dashboard health
curl http://localhost:3001/health

# Expected response
{
  "status": "healthy",
  "service": "bull-board",
  "timestamp": "2025-10-26T..."
}
```

### Metrics to Monitor
1. Queue lengths (waiting, active)
2. Job processing rate (jobs/min)
3. Failure rate (failures/total)
4. Average processing time
5. Redis memory usage

## Common Tasks

### View Queue Status
1. Open http://localhost:3001/admin/queues
2. Login with credentials
3. Select queue to view details

### Retry Failed Job
1. Navigate to queue in dashboard
2. Click on "Failed" tab
3. Select job
4. Click "Retry" button

### Clear Queue
1. Navigate to queue
2. Click "Clean" dropdown
3. Select clean option (completed, failed, etc.)

### Test Job Enqueuing
```typescript
// In a service
constructor(
  @InjectQueue(QueueName.EMAIL)
  private emailQueue: Queue
) {}

async sendEmail() {
  await this.emailQueue.add('send-welcome', {
    to: 'user@example.com',
    template: 'welcome'
  })
}
```

## Troubleshooting

### Dashboard Not Starting
**Issue:** `ECONNREFUSED localhost:6379`

**Solution:**
```bash
# Start Redis
brew services start redis

# Or with Docker
docker run -d -p 6379:6379 redis:alpine
```

### Port Already in Use
**Issue:** `EADDRINUSE :::3001`

**Solution:**
```bash
export BULL_BOARD_PORT=3002
npm run start:dashboard:dev
```

### Jobs Not Processing
**Issue:** Jobs stuck in "waiting" state

**Solution:**
- Ensure workers are running (Phase 4)
- Check Redis connection
- Verify processor is registered
- Check worker logs

## Resources

### External Documentation
- [BullMQ Official Docs](https://docs.bullmq.io/)
- [Bull Board GitHub](https://github.com/felixmosh/bull-board)
- [Redis Documentation](https://redis.io/documentation)
- [PM2 Documentation](https://pm2.keymetrics.io/)

### Internal Documentation
- [Architecture](../architecture/BULL_QUEUE_ARCHITECTURE.md)
- [Enterprise Progress](../progress/ENTERPRISE_PROGRESS.md)
- [Session Management](../features/auth/SESSION_PROGRESS.md)
- [Logging](../features/logging/)

## Support

### Questions?
1. Check this documentation index
2. Review architecture document
3. Check queue README
4. Contact team lead

### Issues?
1. Check troubleshooting section
2. Review logs in dashboard
3. Check Redis connection
4. Verify configuration

---

**Last Updated:** October 26, 2025  
**Current Phase:** Phase 1 Complete ✅  
**Next Phase:** Phase 2 - Session Cleanup Migration  
**Overall Progress:** 20% (1/5 phases)
