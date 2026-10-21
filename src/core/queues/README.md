# Bull Queue Infrastructure - Phase 1 Complete ✅

## Overview

Phase 1 of the Bull Queue implementation is complete! This establishes the foundational infrastructure for moving all background jobs from the main application to dedicated queue workers.

## What's Been Implemented

### ✅ Dependencies Installed

- `@nestjs/bullmq` - NestJS integration for BullMQ
- `bullmq` - Modern Bull queue library with TypeScript support
- `@bull-board/api` - Bull Board core
- `@bull-board/express` - Express adapter for Bull Board
- `@bull-board/nestjs` - NestJS integration for Bull Board
- `express-basic-auth` - Security for dashboard

### ✅ Directory Structure Created

```
src/core/queues/                 # shared queue infrastructure (no feature code)
├── config/
│   └── queue.config.ts          # Connection fallbacks and job options (retries, retention)
├── jobs/
│   └── types.ts                 # Queue names, job types, interfaces
├── processors/
│   ├── base.processor.ts        # Retry / dead-letter handling shared by all processors
│   └── email.processor.ts
└── queues.module.ts             # BullMQ connection + queue registration

src/modules/<module>/jobs/       # a feature module's processors and schedulers
├── *.processor.ts
├── *.scheduler.ts
└── <module>-jobs.module.ts      # imported only by the worker

src/worker.module.ts             # worker root module: composes the jobs modules
src/worker.ts                    # worker bootstrap entry
```

### Producing jobs: use the outbox

Jobs that follow a database change go through `OutboxService` (`src/core/outbox`), not
`queue.add()`: the job is a row written in the same transaction, and `OutboxRelay` (worker
process) hands it to BullMQ. A rolled-back change sends nothing, and a Redis outage delays
jobs instead of losing them.

```ts
await dataSource.transaction(async manager => {
  const user = await manager.save(newUser)
  await emailQueueService.queueWelcomeEmail(user.email, name, link, { manager })
  // or, for any queue:
  await outbox.enqueue({ queue: QueueName.X, name: 'job', data, delayMs: 0 }, manager)
})
```

Delivery is at-least-once (the message id is the BullMQ jobId, which de-duplicates
re-dispatch while the job is still in Redis), so processors must tolerate a repeat.
High-frequency, self-healing jobs (the failed-login counter reset) still use `queue.add()`.

Processors start consuming as soon as they are instantiated, so they live in a
separate `<module>-jobs.module.ts` that only `src/worker.module.ts` imports, never in
the feature module itself (which the API also loads).

### ✅ Queues Registered

Every queue has a processor in the worker:

| Queue                         | Processor                    | Jobs                                        |
| ----------------------------- | ---------------------------- | ------------------------------------------- |
| `session-cleanup-queue`       | `SessionCleanupProcessor`    | Expired sessions and reset tokens           |
| `account-security-queue`      | `AccountSecurityProcessor`   | Account unlocks, expired-lock sweeps        |
| `email-queue`                 | `EmailProcessor`             | Every email (enqueued through the outbox)   |
| `attachment-processing-queue` | `AttachmentProcessor`        | Image processing (EXIF strip, derivatives)  |
| `version-cleanup-queue`       | `VersionCleanupProcessor`    | Daily story version prune                   |
| `content-publishing-queue`    | `ContentPublishingProcessor` | Scheduled content going live (every minute) |
| `audit-retention-queue`       | `AuditRetentionProcessor`    | Daily audit purge                           |
| `dead-letter-queue`           | none (handled by hand)       | Jobs that failed their last attempt         |

### ✅ Bull Board Dashboard

Real-time monitoring UI accessible at: `http://localhost:3001/admin/queues`

**Features:**

- Monitor all queue jobs in real-time
- Retry failed jobs
- Remove stuck jobs
- View job details and payloads
- Queue statistics and metrics
- Basic auth protection

**Default Credentials:**

- Username: `admin`
- Password: `admin123`

### ✅ Configuration

Added to `src/config/configuration.ts`:

```typescript
redis: {
  queueDb: 1  // Separate Redis DB for queues
}
bullBoard: {
  username: 'admin',
  password: 'admin123',
  port: 3001
}
```

**Environment Variables:**

- `REDIS_QUEUE_DB` - Redis database for queues (default: 1)
- `BULL_BOARD_USERNAME` - Dashboard username (default: admin)
- `BULL_BOARD_PASSWORD` - Dashboard password (default: admin123)
- `BULL_BOARD_PORT` - Dashboard port (default: 3001)

## Queue Configuration Highlights

### Retries and the dead-letter queue

Jobs retry with exponential backoff (3 attempts by default, 5 for email). Processors
extend `BaseProcessor`, whose `@OnWorkerEvent` handlers log the lifecycle and move a job
that failed its last attempt to `dead-letter-queue`, once (its id there is
`<queue>-<job id>`). Job data is not logged unless a processor overrides `getLogData`
(emails carry reset and verification links).

### Rate limits and timeouts

Rate limits are worker settings in BullMQ: they go on the processor
(`@Processor(QueueName.EMAIL, { concurrency: 5, limiter: { max: 500, duration: 60_000 } })`),
not on the queue registration, where BullMQ ignores them. BullMQ has no job timeout
option; a processor that must not run long enforces its own time budget.

### Job Retention

- Completed jobs: kept 24 hours (at most 1000)
- Failed jobs: kept 7 days (at most 5000)
- Dead letters: kept until removed

## How to Use

### Start the Dashboard

```bash
# Development (with hot reload)
npm run start:dashboard:dev

# Production
npm run start:dashboard
```

Then visit: http://localhost:3001/admin/queues

### Verify Queue Infrastructure

```bash
# Build application
npm run build

# Start main app (API mode)
npm run start:dev

# In another terminal, start dashboard
npm run start:dashboard:dev
```

The dashboard should show all 9 queues with 0 jobs (initially).

### Start the Worker

```bash
# Development
npm run start:worker:dev

# Production
npm run build
npm run start:worker
```

The worker boots `QueueWorkerModule`, registers processors, and keeps the repeatable session-cleanup jobs scheduled.

## Queue Configuration Examples

Per-queue job options live in `config/queue.config.ts`:

```typescript
[QueueName.EMAIL]: {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 }
  }
}
```

Worker options (concurrency, rate limit) live on the processor's `@Processor` decorator.

## Architecture

```
┌─────────────┐
│   API App   │ ─────┐
└─────────────┘      │
                     ├──→ Redis (DB 1)
┌─────────────┐      │     (Bull Queues)
│  Dashboard  │ ─────┤
└─────────────┘      │
                     │
┌─────────────┐      │
│   Workers   │ ─────┘
└─────────────┘
  (Phase 2)
```

## Phase 2 Status - Session Cleanup

- [x] `SessionCleanupProcessor` registered and logging job outcomes
- [x] `SessionCleanupScheduler` adds repeatable jobs (hourly cleanup + 30-minute expiring check)
- [x] Worker bootstrap (`src/worker.ts`) + PM2 entry (`susanoo-worker`)
- [ ] Producers hooked into API/manual triggers
- [x] Legacy `@Cron` decorators removed (scheduling lives in `AuthJobsScheduler`)
- [ ] E2E tests covering queue-driven cleanup flows

Once producers are in place we can delete the cron jobs and rely entirely on the queue for lifecycle management.

## Testing Checklist

- [x] Dependencies installed
- [x] Queue module created
- [x] All 9 queues registered
- [x] Configuration added
- [x] Bull Board dashboard implemented
- [x] Integration with AppModule
- [x] Build successful
- [ ] Dashboard accessible (manual test needed)
- [ ] Redis queue DB separate from cache DB

## Manual Testing

### 1. Start Dashboard

```bash
npm run start:dashboard:dev
```

Expected output:

```
📊 Initializing Bull Board Dashboard...
   Redis: localhost:6379 (DB 1)
✅ Bull Board Dashboard is running!
   URL: http://localhost:3001/admin/queues
   Username: admin
   Password: admin123
```

### 2. Access Dashboard

1. Open browser: http://localhost:3001/admin/queues
2. Enter credentials: admin / admin123
3. Verify all 9 queues are visible
4. Each queue should show: 0 waiting, 0 active, 0 completed, 0 failed

### 3. Health Check

```bash
curl http://localhost:3001/health
```

Expected:

```json
{
  "status": "healthy",
  "service": "bull-board",
  "timestamp": "2025-10-26T..."
}
```

## Common Issues

### Redis Connection Failed

**Error:** `ECONNREFUSED localhost:6379`

**Solution:** Start Redis

```bash
# macOS
brew services start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

### Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3001`

**Solution:** Change dashboard port

```bash
export BULL_BOARD_PORT=3002
npm run start:dashboard:dev
```

### Build Errors

If you see TypeScript errors, ensure all dependencies are installed:

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Security Notes

⚠️ **Change Default Credentials in Production!**

```bash
# .env.production
BULL_BOARD_USERNAME=your-secure-username
BULL_BOARD_PASSWORD=your-secure-password
```

Consider:

- Using stronger passwords (20+ characters)
- Implementing IP whitelisting
- Running dashboard behind VPN
- Using OAuth/SSO for authentication

## Performance Notes

### Redis Database Separation

- DB 0: Cache (existing)
- DB 1: Queues (new)

This prevents cache eviction from affecting queues and vice versa.

### Memory Considerations

Each queue stores:

- Job payloads
- Job metadata
- Retry history
- Completion/failure data

Monitor Redis memory usage:

```bash
redis-cli INFO memory
```

### Recommended Redis Configuration

```
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru  # For cache DB
```

## Monitoring

### Queue Health Indicators

- **Waiting jobs piling up** → Add more workers
- **High failure rate** → Check job logic/dependencies
- **Jobs timing out** → Increase timeout or optimize
- **Redis memory high** → Adjust retention policies

### Metrics to Watch

1. Queue lengths (waiting, active)
2. Job processing rate (jobs/min)
3. Failure rate (failures/total)
4. Average processing time
5. Redis memory usage

## Documentation

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Bull Board Documentation](https://github.com/felixmosh/bull-board)
- [Queue Configuration](./config/queue.config.ts)
- [Background work (architecture overview)](../../../docs/architecture/README.md#background-work)
- [ADR 0004: transactional outbox](../../../docs/adr/0004-transactional-outbox.md)

## Phase 1 Complete! 🎉

Infrastructure is ready. Next: Phase 2 - Migrate Session Cleanup jobs.

---

**Created:** October 26, 2025  
**Status:** ✅ Complete  
**Next:** Phase 2 - Session Cleanup Migration
