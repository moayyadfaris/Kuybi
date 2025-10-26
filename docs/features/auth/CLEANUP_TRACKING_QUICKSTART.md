# 🎯 Quick Start: Track Session Cleanup Jobs

## TL;DR

You now have **3 ways** to track cleanup jobs:

### 1. **REST API** (New! ✨)
```bash
# Get cleanup stats
GET /admin/cleanup/stats

# Response:
{
  "lastCleanupTime": "2025-10-24T11:00:00Z",
  "totalCleaned": 1247,
  "isHealthy": true,
  "nextScheduledRun": "2025-10-24T12:00:00Z",
  "uptime": "35 minutes ago"
}

# Trigger manual cleanup
POST /admin/cleanup/trigger
{ "olderThanDays": 30 }
```

### 2. **Logs** (Already Working)
```bash
# Watch in development
npm run start:dev | grep "cleanup"

# Production (JSON logs)
jq 'select(.action | contains("cleanup"))' app.log
```

### 3. **Built-in Stats** (Code Access)
```typescript
// Already available in SessionCleanupService
const stats = cleanupService.getCleanupStats()
// {
//   lastCleanupTime: Date,
//   totalCleaned: number,
//   isHealthy: boolean
// }
```

---

## What's Tracked

Your cleanup service tracks:

| Metric | Description | How to Access |
|--------|-------------|---------------|
| **Last Run Time** | When cleanup last executed | `lastCleanupTime` |
| **Total Cleaned** | Sessions cleaned since startup | `totalCleaned` |
| **Health Status** | `true` if ran within 2 hours | `isHealthy` |
| **Next Run** | Calculated next execution | `nextScheduledRun` |
| **Deleted Count** | Per-run cleanup count | Logs: `deleted` field |
| **Duration** | Cleanup execution time (ms) | Logs: `duration` field |
| **Suspicious Sessions** | High-risk sessions found | Logs: `count` field |

---

## Scheduled Jobs

| Job | Schedule | What It Does | Log Action |
|-----|----------|--------------|------------|
| **Cleanup** | Every hour (:00) | Deletes sessions >30 days old | `scheduled_cleanup_complete` |
| **Monitoring** | Every 30 min | Checks expiring + suspicious sessions | `expiring_sessions_check`, `suspicious_sessions_detected` |

---

## Example Log Outputs

### Successful Cleanup
```json
{
  "level": 30,
  "context": "SessionCleanupService",
  "deleted": 23,
  "duration": 145,
  "totalCleaned": 1247,
  "action": "scheduled_cleanup_complete",
  "jobType": "cron",
  "msg": "Session cleanup completed"
}
```

### Warning: Expiring Sessions
```json
{
  "level": 40,
  "context": "SessionCleanupService",
  "count": 5,
  "withinMinutes": 60,
  "action": "expiring_sessions_check",
  "msg": "Sessions expiring soon"
}
```

### Alert: Suspicious Sessions
```json
{
  "level": 40,
  "context": "SessionCleanupService",
  "count": 2,
  "action": "suspicious_sessions_detected",
  "msg": "Suspicious sessions detected"
}
```

---

## Quick Commands

```bash
# Development - Watch cleanup logs
npm run start:dev | grep -E "(cleanup|suspicious)"

# Production - Query JSON logs
# All cleanup events
jq 'select(.context == "SessionCleanupService")' app.log

# Only successful cleanups
jq 'select(.action == "scheduled_cleanup_complete")' app.log

# Failed cleanups
jq 'select(.level == 50 and .context == "SessionCleanupService")' app.log

# Count total cleaned from logs
jq 'select(.action == "scheduled_cleanup_complete") | .deleted' app.log | 
  awk '{sum+=$1} END {print sum}'
```

---

## Files Created

1. ✅ `cleanup-stats.controller.ts` - REST API endpoints
2. ✅ `SESSION_CLEANUP_TRACKING.md` - Comprehensive guide
3. ✅ Updated `auth.module.ts` - Added controller

**Build Status:** ✅ Success (0 errors)

---

## Test It Now

```bash
# Start the app
npm run start:dev

# Call the stats endpoint (replace JWT)
curl -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/admin/cleanup/stats

# Watch the logs
# You'll see cleanup logs every hour at :00
# And monitoring logs every 30 minutes
```

---

## Need More?

See [SESSION_CLEANUP_TRACKING.md](./SESSION_CLEANUP_TRACKING.md) for:
- Prometheus metrics integration
- Dashboard queries (ELK, Grafana)
- Alert setup examples
- Troubleshooting guide
- Advanced monitoring patterns

---

**Your cleanup jobs are fully tracked and observable!** 🎉
