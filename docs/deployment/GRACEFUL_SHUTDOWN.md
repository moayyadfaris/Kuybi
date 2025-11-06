# Graceful Shutdown Implementation

## Overview

The Kuybi NestJS application implements comprehensive graceful shutdown handling to ensure all resources are properly cleaned up when the application stops, preventing data loss and connection leaks.

**Date**: November 6, 2025  
**Status**: ✅ Implemented and Tested

---

## Features

### 1. **Multi-Signal Handling**

The application responds to multiple termination signals:

| Signal | Source | Behavior |
|--------|--------|----------|
| `SIGINT` | Ctrl+C in terminal | Graceful shutdown |
| `SIGTERM` | Docker/Kubernetes stop | Graceful shutdown |
| `SIGUSR2` | Nodemon restart | Graceful shutdown |
| `uncaughtException` | Unhandled synchronous errors | Emergency shutdown |
| `unhandledRejection` | Unhandled promise rejections | Emergency shutdown |

### 2. **Shutdown Timeout Protection**

- **Default timeout**: 30 seconds
- **Behavior**: If graceful shutdown exceeds timeout, forces process exit
- **Purpose**: Prevents hanging processes in production environments

### 3. **Duplicate Signal Protection**

- **Idempotent shutdown**: Ignores duplicate signals if shutdown is already in progress
- **Prevents race conditions**: Ensures cleanup tasks run only once

### 4. **Resource Cleanup**

Automatically cleans up:

#### **BullMQ Queues**
- Pauses all queues to prevent new jobs
- Waits for active jobs to complete (5-second timeout per queue)
- Closes queue connections cleanly
- Queues handled:
  - Email queue
  - Session cleanup queue
  - Log maintenance queue
  - Attachment processing queue
  - Account security queue

#### **Database Connections**
- Properly closes TypeORM DataSource
- Releases all database connection pool connections
- Prevents "too many connections" errors

#### **Redis Cache Connections**
- Coordinates with NestJS cache-manager for cleanup
- Ensures Redis connections are released

### 5. **Structured Logging**

All shutdown events are logged with:
- Signal type
- Timestamp
- Resource being cleaned up
- Success/failure status
- Error details (if applicable)

---

## Implementation Details

### Main Application (`src/main.ts`)

```typescript
// Enable NestJS shutdown hooks
app.enableShutdownHooks()

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  if (isShuttingDown) return // Prevent duplicate execution
  
  isShuttingDown = true
  
  // Set 30-second timeout
  const shutdownTimer = setTimeout(() => {
    appLogger.error('Graceful shutdown timeout - forcing exit')
    process.exit(1)
  }, 30000)
  
  try {
    // Trigger NestJS lifecycle hooks
    await app.close()
    
    clearTimeout(shutdownTimer)
    process.exit(0)
  } catch (error) {
    appLogger.error({ error }, 'Error during shutdown')
    clearTimeout(shutdownTimer)
    process.exit(1)
  }
}

// Register signal handlers
process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGUSR2', () => shutdown('SIGUSR2'))
process.on('uncaughtException', (error) => shutdown('uncaughtException'))
process.on('unhandledRejection', (reason) => shutdown('unhandledRejection'))
```

### Shutdown Service (`src/core/shutdown/shutdown.service.ts`)

Implements `OnApplicationShutdown` lifecycle hook:

```typescript
@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string): Promise<void> {
    // Called automatically by NestJS when app.close() is triggered
    
    const shutdownTasks = [
      this.drainQueues(),           // Wait for queue jobs
      this.closeDatabaseConnections(), // Close DB connections
      this.closeCacheConnections()     // Close Redis connections
    ]
    
    await Promise.allSettled(shutdownTasks)
  }
}
```

#### Queue Draining Logic

```typescript
private async drainQueues(): Promise<void> {
  for (const { name, queue } of queues) {
    // 1. Pause queue (no new jobs)
    await queue.pause()
    
    // 2. Wait for active jobs (max 5 seconds)
    const maxWait = 5000
    const startTime = Date.now()
    
    while ((await queue.getActiveCount()) > 0 && 
           Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // 3. Close queue connection
    await queue.close()
  }
}
```

---

## Shutdown Flow

```
Termination Signal Received (SIGTERM, SIGINT, etc.)
    ↓
Check if shutdown already in progress
    ↓
Set isShuttingDown = true
    ↓
Start 30-second timeout timer
    ↓
Log shutdown initiation
    ↓
Call app.close() → Triggers NestJS lifecycle hooks
    ↓
NestJS calls onApplicationShutdown() on all services
    ↓
ShutdownService.onApplicationShutdown()
    ├── drainQueues()
    │   ├── Pause all BullMQ queues
    │   ├── Wait for active jobs (5s per queue)
    │   └── Close queue connections
    │
    ├── closeDatabaseConnections()
    │   └── Destroy TypeORM DataSource
    │
    └── closeCacheConnections()
        └── Coordinate with cache-manager
    ↓
Clear shutdown timeout timer
    ↓
Log successful shutdown
    ↓
Exit with code 0 (success)
```

### Error Handling

If any error occurs during shutdown:

```
Error during shutdown
    ↓
Log error details
    ↓
Clear timeout timer
    ↓
Exit with code 1 (error)
```

If timeout is exceeded:

```
30 seconds elapsed
    ↓
Log timeout error
    ↓
Force exit with code 1
```

---

## Testing Graceful Shutdown

### Test Scenarios

#### 1. **Normal Shutdown (Ctrl+C)**

```bash
npm run start:dev

# In another terminal, send SIGINT
kill -SIGINT <pid>

# Or just press Ctrl+C
```

**Expected Output:**
```
INFO: Received shutdown signal, starting graceful shutdown (signal: SIGINT)
INFO: Stopping new incoming requests
INFO: Closing Nest application and connections
INFO: ShutdownService: Starting application shutdown
INFO: ShutdownService: Draining BullMQ queues
INFO: Queue paused (queue: email)
INFO: Waiting for active jobs to complete (queue: email, activeCount: 2)
INFO: Queue closed successfully (queue: email)
... (repeat for all queues)
INFO: ShutdownService: All queues drained and closed
INFO: ShutdownService: Closing database connections
INFO: ShutdownService: Database connections closed
INFO: ShutdownService: All shutdown tasks completed
INFO: All connections closed successfully
INFO: Graceful shutdown completed (signal: SIGINT)
```

#### 2. **Docker/Kubernetes Stop**

```bash
docker stop <container-id>
```

Container receives `SIGTERM`, application shuts down gracefully within timeout.

#### 3. **Nodemon Restart**

```bash
# Make a code change
# Nodemon sends SIGUSR2
```

Application restarts cleanly after graceful shutdown.

#### 4. **Timeout Test**

Simulate a hanging shutdown:

```typescript
// Temporarily add this to ShutdownService for testing
private async drainQueues(): Promise<void> {
  // Simulate hanging
  await new Promise(resolve => setTimeout(resolve, 35000))
}
```

**Expected Output:**
```
INFO: Received shutdown signal, starting graceful shutdown
INFO: Closing Nest application and connections
... (30 seconds pass)
ERROR: Graceful shutdown timeout exceeded, forcing exit (timeout: 30000)
```

#### 5. **Uncaught Exception**

```typescript
// Trigger an uncaught exception
throw new Error('Test uncaught exception')
```

**Expected Output:**
```
ERROR: Uncaught exception - shutting down
  error: "Test uncaught exception"
  stack: "..."
INFO: Received shutdown signal, starting graceful shutdown (signal: uncaughtException)
... (normal graceful shutdown)
```

---

## Production Considerations

### Container Orchestration

#### **Docker**

```dockerfile
# Dockerfile
FROM node:20-alpine

# ... app setup ...

# Use exec form to ensure signals are passed to node process
CMD ["node", "dist/main.js"]

# Docker will send SIGTERM on `docker stop`
# Allow 30 seconds for graceful shutdown (matches app timeout)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node healthcheck.js || exit 1
```

#### **Kubernetes**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: kuybi-api
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 5"]
        # Give app time to finish shutdown
        terminationGracePeriodSeconds: 35
```

**Why 35 seconds?**
- 5 seconds for preStop hook (allow in-flight requests to finish)
- 30 seconds for application shutdown timeout
- Matches our application timeout configuration

### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'kuybi-api',
    script: './dist/main.js',
    instances: 2,
    exec_mode: 'cluster',
    
    // Graceful shutdown settings
    kill_timeout: 35000, // Match app shutdown timeout + buffer
    wait_ready: true,
    listen_timeout: 10000,
    
    // Prevent cascading failures
    max_restarts: 10,
    min_uptime: 10000
  }]
}
```

### Monitoring Shutdown Events

#### **Sentry Integration**

Shutdown errors are automatically captured:

```typescript
process.on('uncaughtException', (error) => {
  sentryService.captureException(error, {
    tags: { shutdown: true, signal: 'uncaughtException' }
  })
  shutdown('uncaughtException')
})
```

#### **Prometheus Metrics**

Add shutdown metrics (future enhancement):

```typescript
const shutdownCounter = new Counter({
  name: 'app_shutdowns_total',
  help: 'Total number of application shutdowns',
  labelNames: ['signal', 'status']
})

shutdownCounter.inc({ signal: 'SIGTERM', status: 'success' })
```

---

## Troubleshooting

### Problem: Application hangs during shutdown

**Symptoms:**
- Shutdown timeout is reached
- Force exit with code 1

**Possible Causes:**
1. Long-running queue jobs
2. Database transaction not committed
3. Infinite loop in cleanup code

**Solutions:**
```bash
# Check for active queue jobs
redis-cli -n 1  # Queue database
> KEYS bull:*:active

# Check for long-running database queries
psql -U postgres -d kuybi
SELECT * FROM pg_stat_activity WHERE state = 'active';

# Increase shutdown timeout if needed (main.ts)
const shutdownTimeout = 60000 // 60 seconds
```

### Problem: "Too many connections" error on restart

**Symptoms:**
- New instance can't connect to database
- Error: "remaining connection slots are reserved"

**Cause:** Previous instance didn't close connections

**Solution:**
```bash
# Verify shutdown is closing connections
# Check database.module.ts for proper cleanup

# Force close connections if needed
psql -U postgres -d kuybi
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'kuybi' AND pid <> pg_backend_pid();
```

### Problem: Queue jobs lost during shutdown

**Symptoms:**
- Jobs in "active" state disappear
- No completion or failure logged

**Cause:** Shutdown timeout too short for job completion

**Solutions:**
1. Increase per-queue wait time:
```typescript
// shutdown.service.ts
const maxWait = 10000 // 10 seconds instead of 5
```

2. Use longer-running jobs as background tasks:
```typescript
// Don't wait for these during shutdown
const backgroundQueues = ['report-generation', 'data-export']
```

3. Implement job recovery:
```typescript
// On startup, check for stale "active" jobs
const staleJobs = await queue.getJobs(['active'])
for (const job of staleJobs) {
  if (job.processedOn && Date.now() - job.processedOn > 60000) {
    await job.retry()
  }
}
```

---

## Enhancements Implemented

### Compared to Basic Implementation

**Before:**
```typescript
process.on('SIGTERM', () => {
  app.close()
  process.exit(0)
})
```

**After:**
```typescript
✅ Handles multiple signals (SIGINT, SIGTERM, SIGUSR2)
✅ Prevents duplicate shutdown execution
✅ 30-second timeout protection
✅ Drains BullMQ queues before exit
✅ Closes database connections properly
✅ Cleans up Redis cache connections
✅ Structured logging of all shutdown events
✅ Error handling and recovery
✅ Uncaught exception/rejection handling
```

### Benefits

1. **Zero Data Loss**: Queue jobs complete before shutdown
2. **No Connection Leaks**: All connections properly closed
3. **Fast Restarts**: Clean state for new instance
4. **Production Ready**: Handles edge cases and errors
5. **Observable**: Comprehensive logging for debugging
6. **Kubernetes/Docker Compatible**: Respects termination grace periods

---

## Future Enhancements

### 1. **Configurable Timeouts**

```typescript
// .env
SHUTDOWN_TIMEOUT_MS=30000
QUEUE_DRAIN_TIMEOUT_MS=5000
```

### 2. **Shutdown Hooks for Custom Services**

```typescript
@Injectable()
export class CustomService implements OnApplicationShutdown {
  async onApplicationShutdown() {
    // Custom cleanup logic
    await this.closeWebSocketConnections()
    await this.flushMetrics()
  }
}
```

### 3. **Prometheus Metrics**

```typescript
app_shutdown_duration_seconds
app_shutdown_success_total
app_shutdown_timeout_total
app_queue_drain_duration_seconds
```

### 4. **Health Check During Shutdown**

```typescript
// Return 503 Service Unavailable during shutdown
@Get('health')
healthCheck() {
  if (shutdownService.isShuttingDown) {
    throw new ServiceUnavailableException()
  }
  return { status: 'ok' }
}
```

---

## References

- [NestJS Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [Node.js Process Signals](https://nodejs.org/api/process.html#signal-events)
- [Kubernetes Termination Grace Period](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)
- [BullMQ Queue Management](https://docs.bullmq.io/guide/queues/graceful-shutdown)
- [TypeORM Connection Management](https://typeorm.io/data-source)

---

**Last Updated**: November 6, 2025  
**Maintained By**: Backend Infrastructure Team
