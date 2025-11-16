# API Performance & Stress Testing Guide

This guide helps diagnose and fix slow API responses, particularly when frontend calls are slower than Postman/direct server calls.

## 🎯 Problem Statement

**Symptoms**:
- API calls from Postman: Fast (~100-200ms)
- API calls from Frontend: Slow (~2000ms+)
- Inconsistent response times

**Common Causes**:
1. **CORS preflight requests** - Adds extra round trip
2. **Missing compression** - Large payloads take longer to download
3. **No connection reuse** - Each request creates new TCP connection
4. **Browser network throttling** - DevTools may have throttling enabled
5. **Database query performance** - Slow queries without indexes
6. **Missing caching** - Repeated queries not cached
7. **Frontend code issues** - Sequential instead of parallel requests

---

## 🚀 Quick Diagnosis (Start Here!)

### Step 1: Run the Diagnostic Tool

This will test your APIs and identify bottlenecks:

```bash
# Set your auth token and story ID
export AUTH_TOKEN="your-jwt-token-here"
export STORY_ID="8"

# Run diagnostic
npm run perf:diagnose
```

**What it tests**:
- Response times (TTFB, download time)
- CORS configuration
- Connection keep-alive
- Response compression
- Statistical analysis (P50, P95, P99)

**Example Output**:
```
✓ Average response time is GOOD (120ms)
✓ TTFB is good - server responds quickly
⚠️  Response is not compressed - enable gzip/brotli
⚠️  Download time is 60% of total - network may be slow
```

### Step 2: Check Database Performance

```bash
npm run perf:db
```

**What it checks**:
- Missing database indexes
- Query execution time
- Table size and bloat
- Connection pool usage
- Query plan analysis

**Example Output**:
```
⚠️  Missing index on story_id
⚠️  Missing composite index on (story_id, version_number)
  Version history query: 45ms
  Single version query: 12ms
```

### Step 3: Frontend Browser Check

Open browser DevTools → Network tab:

1. **Check "Disable cache"** - Test without caching
2. **Look for preflight requests** - OPTIONS requests before GET/POST
3. **Check request waterfall** - Are requests sequential or parallel?
4. **Check throttling** - Should be "No throttling"
5. **Look for large payloads** - Anything over 100KB?

---

## 🧪 Performance Tests

### 1. Automated Performance Tests

Run comprehensive test suite:

```bash
npm run test:performance
```

**What it tests**:
- ✓ Response time under 200ms for version history
- ✓ Handle 100 concurrent requests efficiently
- ✓ Pagination performance
- ✓ Cache effectiveness
- ✓ Memory leak detection
- ✓ Response size analysis

**Example Output**:
```
✓ Version history response time: 145ms
✓ 100 concurrent requests completed in 2500ms
✓ Average response time: 25.00ms
✓ Cache improvement: 45.2%
✓ Response size: 24.50 KB
```

### 2. Load Testing with Artillery

Install Artillery (one-time):
```bash
npm install -g artillery
```

Edit the config file first:
```bash
# Edit test/performance/artillery-load-test.yml
# Update authToken and storyId variables
```

Run load test:
```bash
npm run perf:artillery
```

**What it does**:
- Simulates 4 phases: Warm-up → Sustained load → Spike → Cool down
- Tests 5 realistic scenarios with weighted distribution
- Generates detailed performance metrics

**Example Output**:
```
Summary:
  scenarios.launched: 1500
  scenarios.completed: 1500
  http.request_rate: 25/sec
  http.response_time.min: 45
  http.response_time.max: 850
  http.response_time.p95: 320
  http.response_time.p99: 580
```

---

## 🔧 Common Fixes

### Fix 1: Enable Response Compression

**Symptom**: Large payloads, slow download times

**Solution**: Already enabled in your app! Check logs:
```typescript
// main.ts - compression is already configured
app.use(compression({
  threshold: 1024,  // Compress responses > 1KB
  level: 6          // Balanced compression
}))
```

**Verify**: Check response headers in browser DevTools:
```
Content-Encoding: gzip
```

### Fix 2: Add Database Indexes

**Symptom**: `perf:db` shows missing indexes, slow queries

**Solution**: Run migration to add indexes:

```sql
-- Add to a new migration file
CREATE INDEX IF NOT EXISTS idx_story_versions_story_id 
  ON story_versions(story_id);

CREATE INDEX IF NOT EXISTS idx_story_versions_branch 
  ON story_versions(branch_name);

CREATE INDEX IF NOT EXISTS idx_story_versions_created_by 
  ON story_versions(created_by);

CREATE INDEX IF NOT EXISTS idx_story_versions_story_version 
  ON story_versions(story_id, version_number);

CREATE INDEX IF NOT EXISTS idx_story_versions_created_at 
  ON story_versions(created_at DESC);
```

**Check existing indexes**:
```sql
SELECT * FROM pg_indexes WHERE tablename = 'story_versions';
```

### Fix 3: Enable HTTP/2

**Symptom**: Many sequential requests, high latency

**Solution**: Use HTTPS with HTTP/2 (requires SSL certificate)

```typescript
// main.ts
import * as fs from 'fs'
import * as https from 'https'

const httpsOptions = {
  key: fs.readFileSync('./secrets/private-key.pem'),
  cert: fs.readFileSync('./secrets/certificate.pem')
}

await app.listen(4040, '0.0.0.0', () => {
  // HTTP/2 automatically enabled with HTTPS
})
```

### Fix 4: Optimize Frontend Code

**Symptom**: Sequential API calls visible in Network waterfall

**Bad**:
```javascript
// Sequential - each waits for previous
const versions = await fetchVersions()
const version5 = await fetchVersion(5)
const comparison = await compareVersions(1, 5)
```

**Good**:
```javascript
// Parallel - all start simultaneously
const [versions, version5, comparison] = await Promise.all([
  fetchVersions(),
  fetchVersion(5),
  compareVersions(1, 5)
])
```

### Fix 5: Implement Request Caching (Frontend)

**Use React Query or SWR**:

```javascript
// With React Query
import { useQuery } from '@tanstack/react-query'

function VersionHistory({ storyId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['versions', storyId],
    queryFn: () => fetchVersions(storyId),
    staleTime: 30000, // Cache for 30 seconds
    cacheTime: 5 * 60 * 1000 // Keep in memory for 5 minutes
  })
  
  if (isLoading) return <div>Loading...</div>
  return <VersionList versions={data} />
}
```

### Fix 6: Enable Redis Caching (Backend)

**Check if caching is working**:

```typescript
// In your repository or service
const cached = await this.cacheManager.get(`versions:${storyId}`)
if (cached) return cached

const versions = await this.repository.find({ storyId })
await this.cacheManager.set(`versions:${storyId}`, versions, 3600)
return versions
```

**Verify cache hits**:
```bash
# Monitor Redis
redis-cli MONITOR

# You should see GET/SET commands when APIs are called
```

### Fix 7: Database Connection Pooling

**Check if pooling is enabled**:

```typescript
// src/config/configuration.ts
database: {
  pool: {
    enabled: true,
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000
  }
}
```

**Monitor connections**:
```sql
SELECT 
  count(*) as total,
  count(*) FILTER (WHERE state = 'active') as active,
  count(*) FILTER (WHERE state = 'idle') as idle
FROM pg_stat_activity
WHERE datname = 'kuybi';
```

---

## 📊 Performance Benchmarks

### Target Response Times

| Endpoint | Target | Good | Needs Improvement |
|----------|--------|------|-------------------|
| GET /versions | < 200ms | < 150ms | > 300ms |
| GET /versions/:id | < 150ms | < 100ms | > 250ms |
| POST /compare | < 300ms | < 200ms | > 500ms |
| POST /rollback | < 500ms | < 300ms | > 1000ms |
| POST /versions | < 400ms | < 250ms | > 700ms |

### Concurrent Load Targets

| Metric | Target |
|--------|--------|
| Requests/second | > 50 |
| Error rate | < 1% |
| P95 response time | < 500ms |
| P99 response time | < 1000ms |

---

## 🐛 Troubleshooting Frontend Issues

### Issue 1: "2000ms response time on frontend"

**Debug steps**:

1. **Open DevTools Network tab**
2. **Find the slow request**
3. **Check timing breakdown**:
   - **Queueing**: High? Browser connection limit reached
   - **Stalled**: High? DNS/connection issues
   - **DNS Lookup**: High? Add DNS prefetch
   - **Initial connection**: High? Use keep-alive
   - **SSL**: High? Use connection reuse
   - **TTFB** (Time to First Byte): High? Server issue
   - **Content Download**: High? Enable compression or reduce payload

**Example Analysis**:
```
Request to /api/v1/stories/8/versions:
  Queueing:           20ms   ← OK
  Stalled:            100ms  ⚠️ Connection delay
  DNS Lookup:         50ms   ⚠️ Consider DNS prefetch
  Initial connection: 200ms  ⚠️ Use keep-alive
  SSL:                150ms  ⚠️ Connection not reused
  TTFB:              80ms   ✓ Server OK
  Content Download:   400ms  ⚠️ Enable compression
  ──────────────────────────
  Total:             1000ms
```

**Fix**:
```javascript
// Add to your fetch configuration
const api = axios.create({
  baseURL: 'http://localhost:4040/api',
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
})
```

### Issue 2: "Works in Postman but not in browser"

**Check CORS**:
```bash
curl -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" \
  -X OPTIONS \
  http://localhost:4040/api/v1/stories/8/versions
```

**Should return**:
```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: authorization, content-type
```

**Fix in NestJS** (already done):
```typescript
app.enableCors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
})
```

### Issue 3: "First request slow, subsequent requests fast"

**This is normal!** First request:
- DNS lookup
- TCP connection
- SSL handshake
- Auth validation

**Optimize**:
1. Use HTTP/2 (multiplexing)
2. Enable keep-alive
3. Preload critical resources
4. Add loading states to improve UX

---

## 📈 Monitoring in Production

### 1. Enable Application Metrics

```typescript
// Add to your main.ts
import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('story-versions')
const responseTimeHistogram = meter.createHistogram('http_response_time', {
  description: 'HTTP response time in ms'
})

// In your interceptor
responseTimeHistogram.record(duration, {
  endpoint: req.url,
  method: req.method,
  statusCode: res.statusCode
})
```

### 2. Add Performance Logging

```typescript
// In your service
this.logger.info({
  action: 'get_versions',
  storyId,
  duration: Date.now() - startTime,
  cacheHit: !!cached,
  resultCount: versions.length
})
```

### 3. Set Up Alerts

```yaml
# Example alert rules
- alert: HighAPILatency
  expr: http_response_time_p95 > 500
  for: 5m
  annotations:
    summary: "API response time is high"

- alert: HighErrorRate
  expr: http_errors_total / http_requests_total > 0.01
  for: 5m
  annotations:
    summary: "Error rate exceeds 1%"
```

---

## 🎯 Quick Wins Checklist

- [ ] Run `npm run perf:diagnose` to identify issues
- [ ] Run `npm run perf:db` to check database performance
- [ ] Check browser DevTools Network tab
- [ ] Verify response compression is enabled
- [ ] Add missing database indexes
- [ ] Enable Redis caching
- [ ] Use connection pooling
- [ ] Implement frontend request caching (React Query/SWR)
- [ ] Make parallel requests instead of sequential
- [ ] Add loading states to improve perceived performance
- [ ] Monitor P95/P99 response times

---

## 📞 Getting Help

If performance issues persist after trying these fixes:

1. **Run full diagnostic suite**:
   ```bash
   npm run perf:diagnose > diagnosis.txt
   npm run perf:db > db-analysis.txt
   npm run test:performance > test-results.txt
   ```

2. **Collect browser timeline**:
   - Open DevTools → Performance tab
   - Click Record
   - Perform slow operation
   - Stop recording
   - Export trace

3. **Check server logs**:
   ```bash
   npm run logs:view
   # Look for slow query warnings
   ```

4. **Contact team** with:
   - Diagnostic output files
   - Browser performance trace
   - Specific endpoint and payload
   - Expected vs actual response time

---

## 📚 Additional Resources

- [NestJS Performance Optimization](https://docs.nestjs.com/techniques/performance)
- [PostgreSQL Query Optimization](https://www.postgresql.org/docs/current/performance-tips.html)
- [Redis Caching Strategies](https://redis.io/docs/manual/patterns/cache/)
- [HTTP/2 Benefits](https://developers.google.com/web/fundamentals/performance/http2)
- [Web Performance Best Practices](https://web.dev/fast/)

---

**Last Updated**: November 16, 2025  
**Maintainer**: Backend Team
