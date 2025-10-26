# 📊 Session Cleanup Job Tracking Guide

## Overview

Your `SessionCleanupService` includes comprehensive tracking capabilities. Here are all the ways you can monitor and track the scheduled cleanup jobs.

---

## 🎯 Quick Answer

### **1. Check Cleanup Stats via API** (Recommended)

```bash
# Get cleanup statistics
GET /admin/cleanup/stats
Authorization: Bearer <your-jwt-token>

# Response:
{
  "lastCleanupTime": "2025-10-24T11:00:00.000Z",
  "totalCleaned": 1247,
  "isHealthy": true,
  "nextScheduledRun": "2025-10-24T12:00:00.000Z",
  "uptime": "35 minutes ago",
  "schedule": {
    "cleanup": "Every hour at :00",
    "monitoring": "Every 30 minutes"
  }
}
```

### **2. Monitor Logs** (Best for Production)

Your cleanup service already logs everything with Pino structured logging:

```bash
# Watch cleanup logs in development
npm run start:dev | grep -E "(cleanup|suspicious)"

# In production (JSON logs)
# Filter by action field
jq 'select(.action | contains("cleanup"))' < app.log
```

---

## 📡 Tracking Methods

### Method 1: REST API Endpoints ✅ NEW

I've created a new controller for you: `CleanupStatsController`

#### **Get Statistics**
```http
GET /admin/cleanup/stats
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "lastCleanupTime": "2025-10-24T11:00:00.000Z",
  "totalCleaned": 1247,
  "isHealthy": true,
  "nextScheduledRun": "2025-10-24T12:00:00.000Z",
  "uptime": "35 minutes ago",
  "schedule": {
    "cleanup": "Every hour at :00",
    "monitoring": "Every 30 minutes"
  }
}
```

**Fields:**
- `lastCleanupTime`: When the last cleanup ran (null if never)
- `totalCleaned`: Total sessions cleaned since app started
- `isHealthy`: `true` if cleanup ran within last 2 hours
- `nextScheduledRun`: Calculated next run time
- `uptime`: Human-readable time since last run

#### **Trigger Manual Cleanup**
```http
POST /admin/cleanup/trigger
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "olderThanDays": 30
}
```

**Response:**
```json
{
  "deleted": 23,
  "duration": 145,
  "timestamp": "2025-10-24T11:35:42.000Z",
  "message": "Cleaned up 23 sessions in 145ms"
}
```

---

### Method 2: Structured Logs (Production) 🔥

Your cleanup service logs **every action** with structured context:

#### **Scheduled Cleanup Logs**

```json
// Cleanup started
{
  "level": 30,
  "time": 1729764000000,
  "context": "SessionCleanupService",
  "action": "scheduled_cleanup_start",
  "jobType": "cron",
  "msg": "Starting scheduled session cleanup"
}

// Cleanup completed
{
  "level": 30,
  "time": 1729764145000,
  "context": "SessionCleanupService",
  "deleted": 23,
  "duration": 145,
  "totalCleaned": 1247,
  "action": "scheduled_cleanup_complete",
  "jobType": "cron",
  "msg": "Session cleanup completed"
}

// Expiring sessions warning
{
  "level": 40,
  "time": 1729764800000,
  "context": "SessionCleanupService",
  "count": 5,
  "withinMinutes": 60,
  "action": "expiring_sessions_check",
  "msg": "Sessions expiring soon"
}

// Suspicious sessions detected
{
  "level": 40,
  "time": 1729764800000,
  "context": "SessionCleanupService",
  "count": 2,
  "action": "suspicious_sessions_detected",
  "msg": "Suspicious sessions detected"
}
```

#### **Query Logs**

```bash
# Development (pretty-print)
npm run start:dev | grep "SessionCleanupService"

# Production (JSON logs - using jq)
# All cleanup events
jq 'select(.context == "SessionCleanupService")' app.log

# Only completed cleanups
jq 'select(.action == "scheduled_cleanup_complete")' app.log

# Failed cleanups
jq 'select(.action == "cleanup_failed")' app.log

# Suspicious sessions
jq 'select(.action == "suspicious_sessions_detected")' app.log

# Last 10 cleanup events
jq 'select(.context == "SessionCleanupService")' app.log | tail -10
```

---

### Method 3: Health Check Integration

Add cleanup health to your existing health endpoint:

```typescript
// In health.controller.ts
import { SessionCleanupService } from '../auth/session-cleanup.service'

@Get('health')
async getHealth() {
  const cleanupStats = this.cleanupService.getCleanupStats()
  
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'healthy',
      redis: 'healthy',
      sessionCleanup: cleanupStats.isHealthy ? 'healthy' : 'degraded'
    },
    sessionCleanup: {
      lastRun: cleanupStats.lastCleanupTime,
      totalCleaned: cleanupStats.totalCleaned,
      healthy: cleanupStats.isHealthy
    }
  }
}
```

---

### Method 4: Monitoring Dashboard Integration

#### **Prometheus Metrics** (Future Enhancement)

```typescript
// Add to SessionCleanupService
import { Counter, Gauge, Histogram } from 'prom-client'

private readonly cleanupCounter = new Counter({
  name: 'session_cleanup_total',
  help: 'Total number of sessions cleaned up'
})

private readonly cleanupDuration = new Histogram({
  name: 'session_cleanup_duration_seconds',
  help: 'Session cleanup duration in seconds'
})

private readonly lastCleanupGauge = new Gauge({
  name: 'session_cleanup_last_run_timestamp',
  help: 'Timestamp of last cleanup run'
})

async handleSessionCleanup() {
  const startTime = Date.now()
  // ... existing code ...
  
  this.cleanupCounter.inc(result.deleted)
  this.cleanupDuration.observe((Date.now() - startTime) / 1000)
  this.lastCleanupGauge.set(Date.now())
}
```

---

## 🔍 Real-World Examples

### Example 1: Check if Cleanup is Running

```bash
# Call the stats endpoint
curl -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/admin/cleanup/stats

# Check isHealthy field
# true = cleanup ran within last 2 hours
# false = cleanup might be stuck
```

### Example 2: Monitor Cleanup Effectiveness

```bash
# Check logs for cleanup patterns
jq 'select(.action == "scheduled_cleanup_complete") | 
    {time: .time, deleted: .deleted, duration: .duration}' app.log

# Output shows cleanup trends:
# {"time":1729760400000,"deleted":23,"duration":145}
# {"time":1729764000000,"deleted":18,"duration":132}
# {"time":1729767600000,"deleted":31,"duration":167}
```

### Example 3: Alert on Suspicious Sessions

```bash
# Monitor for suspicious sessions
jq 'select(.action == "suspicious_sessions_detected") | 
    {time: .time, count: .count}' app.log

# Send alert if count > threshold
```

### Example 4: Track Total Sessions Cleaned

```bash
# Get cumulative total
curl -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/admin/cleanup/stats | jq .totalCleaned

# Output: 1247
```

---

## 📈 Monitoring Best Practices

### 1. **Set Up Alerts**

```yaml
# Example: Alertmanager rule (Prometheus)
- alert: SessionCleanupStalled
  expr: time() - session_cleanup_last_run_timestamp > 7200
  annotations:
    summary: "Session cleanup hasn't run in 2 hours"
    
- alert: HighSuspiciousSessions
  expr: suspicious_sessions_count > 10
  annotations:
    summary: "High number of suspicious sessions detected"
```

### 2. **Dashboard Queries**

```bash
# ELK Stack - Kibana query
context:"SessionCleanupService" AND action:"scheduled_cleanup_complete"

# Grafana - Loki query
{context="SessionCleanupService"} |= "scheduled_cleanup_complete" | json
```

### 3. **Log Rotation**

Ensure you're rotating logs to prevent disk space issues:

```javascript
// logger.config.ts - Add file transport for production
{
  target: 'pino/file',
  options: {
    destination: '/var/log/app/cleanup.log',
    mkdir: true
  }
}
```

---

## 🚨 Troubleshooting

### Cleanup Not Running?

**Check 1: Is @nestjs/schedule installed?**
```bash
npm list @nestjs/schedule
```

**Check 2: Is ScheduleModule imported?**
```typescript
// app.module.ts should have:
import { ScheduleModule } from '@nestjs/schedule'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ...
  ]
})
```

**Check 3: Check logs for errors**
```bash
# Look for cleanup failures
jq 'select(.action == "cleanup_failed")' app.log
```

### Cleanup Running Too Often?

**Adjust cron schedule:**
```typescript
// Change from EVERY_HOUR to custom schedule
@Cron('0 2 * * *') // 2 AM daily
async handleSessionCleanup() {
  // ...
}
```

### Need More Detailed Tracking?

**Add event emitters:**
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter'

async handleSessionCleanup() {
  // ... cleanup logic ...
  
  this.eventEmitter.emit('cleanup.completed', {
    deleted: result.deleted,
    duration,
    timestamp: new Date()
  })
}
```

---

## 📊 Quick Reference

| Method | Use Case | Latency | Best For |
|--------|----------|---------|----------|
| **REST API** | On-demand checks | Real-time | Dashboards, manual checks |
| **Logs** | Historical analysis | Batch | Production monitoring, debugging |
| **Health Check** | Service health | Real-time | Load balancers, orchestrators |
| **Metrics** | Time-series data | Real-time | Grafana, Prometheus |

---

## 🎯 Recommended Setup

For a production environment, I recommend:

1. **✅ Use the REST API** for dashboards and manual checks
2. **✅ Monitor structured logs** with ELK/Datadog/CloudWatch
3. **✅ Add cleanup health** to your health check endpoint
4. **✅ Set up alerts** for:
   - Cleanup hasn't run in 2+ hours
   - High number of suspicious sessions (>10)
   - Cleanup failures
   - Cleanup taking too long (>5 seconds)

---

## 📝 Code Added

I've created:
- ✅ `CleanupStatsController` - REST API for cleanup tracking
- ✅ Added to `AuthModule`
- ✅ Ready to use immediately

**Build and test:**
```bash
npm run build
npm run start:dev

# Test the endpoint
curl -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/admin/cleanup/stats
```

---

## 🔗 Related Documentation

- [PINO_LOGGING_EXPANSION.md](./PINO_LOGGING_EXPANSION.md) - Logging implementation
- [SESSION_MANAGEMENT_COMPLETE.md](./SESSION_MANAGEMENT_COMPLETE.md) - Session module docs
- [ENTERPRISE_PROGRESS.md](../ENTERPRISE_PROGRESS.md) - Overall progress

Your cleanup job is fully tracked and observable! 🎉
