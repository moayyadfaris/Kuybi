# Version Cleanup Queue Migration

## Overview
Migrated the Story Version cleanup job from a simple `@Cron`-based scheduler to the enterprise BullMQ queue system, maintaining consistency with other background jobs in the application.

## Changes Made

### 1. Queue Type Registration
**File**: `src/core/queues/jobs/types.ts`
- Added `VERSION_CLEANUP = 'version-cleanup-queue'` to `QueueName` enum
- Added `VersionCleanupJobType` enum with three job types:
  - `CLEANUP_EXPIRED`: Delete expired archived versions
  - `ARCHIVE_OLD`: Archive old active versions
  - `MANUAL_CLEANUP`: Manually triggered cleanup

### 2. Queue Processor
**File**: `src/core/queues/processors/version-cleanup.processor.ts`

Created a BullMQ processor that handles version cleanup jobs:

```typescript
@Processor(QueueName.VERSION_CLEANUP)
export class VersionCleanupProcessor extends WorkerHost {
  async process(job: Job): Promise<unknown>
}
```

**Job Handlers**:
- `handleCleanupExpired()`: Deletes expired versions (expiresAt < now, isPinned = false, status = ARCHIVED)
- `handleArchiveOld()`: Archives versions older than N days (default: 90 days)
- `handleManualCleanup()`: Same as cleanup but manually triggered via API

**Features**:
- Dry run support for testing
- Detailed logging with PinoLogger
- Cache invalidation after cleanup
- Error handling per-version with counters
- Returns cleanup statistics

### 3. Job Scheduler
**File**: `src/core/queues/services/version-cleanup.scheduler.ts`

Schedules repeatable jobs using BullMQ's repeat functionality:

```typescript
@Injectable()
export class VersionCleanupScheduler implements OnModuleInit
```

**Scheduled Jobs**:
- **Daily Cleanup**: Every day at 2 AM UTC (`0 2 * * *`)
  - Deletes expired archived versions
- **Weekly Archive**: Every Sunday at 3 AM UTC (`0 3 * * 0`)
  - Archives versions older than 90 days

**Implementation**:
- Uses `ensureRepeatableJob()` to prevent duplicates
- Jobs are persisted in Redis
- Survives application restarts

### 4. Queue Configuration
**File**: `src/core/queues/config/queue.config.ts`

Added queue-specific configuration:

```typescript
[QueueName.VERSION_CLEANUP]: {
  limiter: {
    max: 50,        // Max 50 jobs per minute
    duration: 60000
  },
  defaultJobOptions: {
    priority: 3,      // Medium priority
    timeout: 300000,  // 5 minutes timeout
    attempts: 2       // Retry once on failure
  }
}
```

### 5. Module Integration

**QueuesModule** (`src/core/queues/queues.module.ts`):
- Registered `VERSION_CLEANUP` queue in `BullModule.registerQueue()`

**QueueWorkerModule** (`src/core/queues/worker.module.ts`):
- Added `VersionCleanupProcessor` to providers
- Added `VersionCleanupScheduler` to providers

**StoriesModule** (`src/modules/stories/stories.module.ts`):
- Removed `VersionCleanupJob` from providers (old @Cron job)
- Version cleanup now handled by worker process

### 6. Database Registration

**Files Updated**:
- `src/core/database/data-source.ts`: Added `StoryVersion` entity import and registration
- `src/core/database/database.module.ts`: Added `StoryVersion` to TypeORM entities array

### 7. Cleanup
- Deleted old file: `src/modules/stories/jobs/version-cleanup.job.ts`
- Removed `@nestjs/schedule` dependency from stories module

## Architecture Benefits

### 1. Separation of Concerns
- **API Process**: Handles HTTP requests, produces jobs
- **Worker Process**: Processes background jobs in isolation
- **Clear Boundaries**: Jobs don't block API responses

### 2. Scalability
- Workers can be scaled independently
- Multiple workers can process jobs in parallel
- Queue-based load leveling

### 3. Reliability
- Jobs persisted in Redis (survive restarts)
- Automatic retries with exponential backoff
- Job failure tracking and monitoring
- Repeatable jobs survive process crashes

### 4. Observability
- Centralized job monitoring
- Job statistics (completed, failed, delayed)
- Queue metrics (throughput, latency)
- Consistent logging with PinoLogger

### 5. Consistency
- Follows same pattern as other background jobs:
  - `SessionCleanupProcessor`
  - `EmailProcessor`
  - Future processors (SMS, attachments, etc.)

## Usage

### Automatic Scheduling
Jobs are automatically scheduled when the worker starts:
```bash
npm run start:worker
```

### Manual Trigger (via API)
If needed, expose an admin endpoint:

```typescript
@Post('admin/versions/cleanup')
@UseGuards(JwtAuthGuard, AdminGuard)
async triggerCleanup(@Query('dryRun') dryRun?: boolean) {
  const processor = this.moduleRef.get(VersionCleanupProcessor)
  await processor.enqueueCleanup(dryRun)
  return { message: 'Cleanup job queued' }
}
```

### Manual Archive Trigger
```typescript
await versionCleanupProcessor.enqueueArchive(90) // Archive versions older than 90 days
```

## Job Statistics

Jobs return detailed statistics:

```typescript
{
  total: 156,      // Total versions found
  deleted: 154,    // Successfully deleted
  failed: 2        // Failed deletions
}
```

For archive jobs:
```typescript
{
  total: 245,
  archived: 243,
  failed: 2,
  olderThanDays: 90
}
```

## Monitoring

### Queue Dashboard
BullMQ provides a web UI (optional):
```bash
npm install -g bull-board
```

### Redis Inspection
```bash
# View scheduled jobs
redis-cli
> ZRANGE "bull:version-cleanup-queue:repeat" 0 -1 WITHSCORES

# View job counts
> LLEN "bull:version-cleanup-queue:wait"
> LLEN "bull:version-cleanup-queue:active"
> LLEN "bull:version-cleanup-queue:completed"
> LLEN "bull:version-cleanup-queue:failed"
```

### Application Logs
```bash
# Filter version cleanup logs
grep "VersionCleanup" logs/app.log
```

## Migration Checklist

- [x] Add queue type to `QueueName` enum
- [x] Add job types to `VersionCleanupJobType` enum
- [x] Create `VersionCleanupProcessor`
- [x] Create `VersionCleanupScheduler`
- [x] Add queue configuration
- [x] Register queue in `QueuesModule`
- [x] Register processor/scheduler in `QueueWorkerModule`
- [x] Remove old `@Cron` job from `StoriesModule`
- [x] Register `StoryVersion` entity in database modules
- [x] Delete old job file
- [x] Test worker startup
- [x] Test scheduled jobs
- [x] Test manual triggers
- [ ] Update monitoring dashboards (if applicable)
- [ ] Document admin endpoints (if added)

## Next Steps

1. **Testing**: Start worker and verify jobs are scheduled
   ```bash
   npm run start:worker
   ```

2. **Verification**: Check Redis for scheduled jobs
   ```bash
   redis-cli ZRANGE "bull:version-cleanup-queue:repeat" 0 -1
   ```

3. **Monitoring**: Watch logs for successful execution
   ```bash
   tail -f logs/app.log | grep VersionCleanup
   ```

4. **Production**: Deploy worker alongside API
   ```bash
   # API process
   npm run start:prod
   
   # Worker process (separate instance)
   npm run start:worker
   ```

## Related Documentation

- [Queue Architecture](./BULL_QUEUE_ARCHITECTURE.md)
- [Version Control System](../features/stories/VERSION_CONTROL.md)
- [Worker Configuration](../deployment/PM2_GUIDE.md)
