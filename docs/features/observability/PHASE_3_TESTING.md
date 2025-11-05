# Phase 3 Testing Guide

Complete testing guide for OpenTelemetry Phase 3: Production Exporters & Intelligent Sampling.

## Prerequisites

- ✅ Phase 1 & 2 completed
- ✅ Phase 3 code committed
- 🐳 Docker Desktop installed (for observability stack)
- 📝 `.env` file configured

## Quick Test (Without Docker)

If you don't have Docker installed, you can still test the intelligent sampling and configuration:

### 1. Configure Environment

Update your `.env` file:

```bash
# Enable OpenTelemetry
OTEL_ENABLED=true
OTEL_SERVICE_NAME=kuybi-api
OTEL_ENVIRONMENT=development

# Enable console exporter only (no Docker needed)
OTEL_EXPORTER_CONSOLE=true
OTEL_EXPORTER_JAEGER=false
OTEL_EXPORTER_OTLP=false

# Test sampling (50% rate)
OTEL_SAMPLING_RATE=0.5
OTEL_SAMPLING_ERROR_RATE=1.0
OTEL_SAMPLING_CRITICAL_OPS=auth.login,auth.logout
```

### 2. Start Application

```bash
npm run start:dev
```

### 3. Verify Initialization

Look for Phase 3 initialization logs:

```
✅ OpenTelemetry initialized successfully
   Service: kuybi-api v0.1.0
   Environment: development
   Sampling: 50.0% (errors: 100.0%)
   Exporters: console
```

**Expected:**
- ✅ Sampling rate shows 50%
- ✅ Error sampling shows 100%
- ✅ Only console exporter enabled

### 4. Test Sampling Behavior

Make requests and observe sampling:

```bash
# Make 10 requests - expect ~5 to be sampled
for i in {1..10}; do
  curl http://localhost:4040/api/health
  sleep 0.5
done
```

**Expected output:**
- ✅ Only ~50% of requests show traces in console
- ✅ No error spans (health checks are successful)

### 5. Test Error Sampling

Trigger an error to test 100% error sampling:

```bash
# This will fail (404) and should ALWAYS be sampled
curl http://localhost:4040/api/nonexistent
```

**Expected output:**
- ✅ Error trace appears in console despite 50% base sampling
- ✅ Span has `http.status_code=404` attribute
- ✅ Span status shows ERROR

### 6. Test Critical Operation Sampling

Test login (critical operation):

```bash
# Login should ALWAYS be sampled
curl -X POST http://localhost:4040/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kuybi.dev","password":"Admin@123"}'
```

**Expected output:**
- ✅ auth.login span ALWAYS appears (even with 50% sampling)
- ✅ Span has sampling.reason='critical_operation' attribute
- ✅ Full trace with all child spans

---

## Full Test (With Docker)

### Step 1: Start Observability Stack

```bash
# Start all services
docker compose -f docker-compose.observability.yml up -d

# Verify all services are healthy
docker compose -f docker-compose.observability.yml ps

# Check logs
docker compose -f docker-compose.observability.yml logs -f
```

**Expected services:**
```
NAME                     STATUS
kuybi-jaeger             Up (healthy)
kuybi-otel-collector     Up (healthy)
kuybi-prometheus         Up (healthy)
kuybi-grafana            Up (healthy)
```

### Step 2: Verify Service Access

| Service | URL | Expected |
|---------|-----|----------|
| Jaeger UI | http://localhost:16686 | Jaeger homepage |
| Grafana | http://localhost:3000 | Login page (admin/admin) |
| Prometheus | http://localhost:9090 | Prometheus UI |
| OTLP Health | http://localhost:13133 | `{"status":"Server available"}` |

```bash
# Test all endpoints
curl -s http://localhost:13133 | jq
curl -s http://localhost:9090/-/healthy
curl -s http://localhost:3000/api/health | jq
```

### Step 3: Configure Kuybi for Jaeger

Update `.env`:

```bash
# Enable Jaeger exporter
OTEL_ENABLED=true
OTEL_EXPORTER_JAEGER=true
OTEL_JAEGER_ENDPOINT=http://localhost:14268/api/traces

# Disable console in production-like test
OTEL_EXPORTER_CONSOLE=false

# 10% sampling (production-like)
OTEL_SAMPLING_RATE=0.1
```

### Step 4: Start Kuybi Application

```bash
npm run start:dev
```

**Expected logs:**
```
✅ OpenTelemetry initialized successfully
   Service: kuybi-api v0.1.0
   Environment: development
   Sampling: 10.0% (errors: 100.0%)
   Exporters: jaeger
```

### Step 5: Generate Test Traffic

```bash
# Option 1: Manual requests
for i in {1..100}; do
  curl -s http://localhost:4040/api/health > /dev/null
  sleep 0.1
done

# Option 2: Test script (if available)
./test/scripts/generate-trace-traffic.sh
```

### Step 6: View Traces in Jaeger

1. Open http://localhost:16686
2. Select Service: **kuybi-api**
3. Click **Find Traces**
4. Expected: ~10-15 traces (10% of 100 requests)

**Verify:**
- ✅ Traces appear in Jaeger
- ✅ ~10% sampling rate observed
- ✅ Trace details show full span hierarchy
- ✅ Span attributes include custom data

### Step 7: Test Error Traces

```bash
# Generate errors (should be 100% sampled)
for i in {1..10}; do
  curl -s http://localhost:4040/api/nonexistent
  sleep 0.2
done
```

**Jaeger search:**
- Search: `error=true`
- Expected: All 10 error traces visible
- Verify: ✅ Errors always sampled despite 10% base rate

### Step 8: Test Critical Operations

```bash
# Test auth.login (critical operation)
curl -X POST http://localhost:4040/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kuybi.dev","password":"Admin@123"}'
```

**Jaeger search:**
- Search: `operation="auth.login"`
- Expected: Login trace visible
- Verify: ✅ Critical operations always sampled

### Step 9: Verify Prometheus Metrics

1. Open http://localhost:9090
2. Test queries:

```promql
# Request rate
rate(http_requests_total[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Cache hit rate
sum(rate(cache_operations_total{result="hit"}[5m])) / sum(rate(cache_operations_total[5m]))
```

**Expected:**
- ✅ All queries return data
- ✅ Metrics match application activity
- ✅ No missing data points

### Step 10: Configure Grafana

1. Open http://localhost:3000
2. Login: `admin` / `admin`
3. Navigate to **Connections** → **Data Sources**
4. Verify:
   - ✅ Prometheus (green)
   - ✅ Jaeger (green)

5. Navigate to **Dashboards**
6. Import dashboard (if not auto-provisioned)

### Step 11: Test Trace-to-Metrics Correlation

1. Find a trace ID in Jaeger
2. Copy trace ID
3. Check if trace context appears in logs
4. Query Prometheus for same time range
5. Verify correlation

### Step 12: Test Sampling Edge Cases

```bash
# Test 1: Very low sampling (1%)
# Update .env: OTEL_SAMPLING_RATE=0.01
# Restart app
# Make 100 requests
# Expected: ~1 trace in Jaeger

# Test 2: 100% sampling
# Update .env: OTEL_SAMPLING_RATE=1.0
# Restart app
# Make 20 requests
# Expected: 20 traces in Jaeger

# Test 3: Custom critical operation
# Update .env: OTEL_SAMPLING_CRITICAL_OPS=story.create
# Create a story
# Expected: story.create span always visible
```

### Step 13: Performance Testing

```bash
# Baseline (without tracing)
# Update .env: OTEL_ENABLED=false
# Restart app
# Run: ab -n 1000 -c 10 http://localhost:4040/api/health
# Note response time

# With 10% sampling
# Update .env: OTEL_ENABLED=true, OTEL_SAMPLING_RATE=0.1
# Restart app
# Run: ab -n 1000 -c 10 http://localhost:4040/api/health
# Note response time

# Expected: <5% performance difference
```

### Step 14: Verify Batch Export

```bash
# Check OTLP collector logs
docker logs kuybi-otel-collector

# Expected to see:
# - Received spans (batched)
# - Processed spans
# - Exported spans to Jaeger
```

### Step 15: Test Exporter Failover

```bash
# Stop Jaeger
docker stop kuybi-jaeger

# Make requests
curl http://localhost:4040/api/health

# Check app logs
# Expected: Exporter errors logged, app continues running

# Restart Jaeger
docker start kuybi-jaeger

# Make more requests
# Expected: Traces appear in Jaeger again
```

---

## Test Results Checklist

### Configuration ✅
- [ ] Custom sampler loaded
- [ ] Sampling rates configured correctly
- [ ] Multiple exporters supported
- [ ] Environment variables working

### Sampling Behavior ✅
- [ ] Head-based sampling works (~10% of traces)
- [ ] Errors always sampled (100%)
- [ ] Critical operations always sampled
- [ ] Deterministic sampling (same trace ID → same decision)

### Exporters ✅
- [ ] Console exporter works (development)
- [ ] Jaeger exporter works (production)
- [ ] OTLP exporter works (cloud)
- [ ] Multiple exporters simultaneously
- [ ] Batch processing active

### Infrastructure ✅
- [ ] Jaeger UI accessible
- [ ] Traces visible in Jaeger
- [ ] Prometheus scraping metrics
- [ ] Grafana datasources connected
- [ ] OTLP collector processing spans

### Performance ✅
- [ ] <5% overhead with 10% sampling
- [ ] No blocking operations
- [ ] Graceful exporter failures
- [ ] Memory usage acceptable

### Business Operations ✅
- [ ] auth.login traced
- [ ] auth.logout traced
- [ ] story.create traced
- [ ] Cache operations traced
- [ ] Database queries traced

---

## Troubleshooting

### Issue: No traces in Jaeger

**Checks:**
```bash
# 1. Verify Jaeger is running
docker ps | grep jaeger

# 2. Check Jaeger logs
docker logs kuybi-jaeger

# 3. Verify OTEL_EXPORTER_JAEGER=true in .env
grep OTEL_EXPORTER_JAEGER .env

# 4. Check app logs for OTel initialization
npm run start:dev | grep "Exporters:"

# 5. Test Jaeger endpoint
curl -X POST http://localhost:14268/api/traces \
  -H "Content-Type: application/json" \
  -d '{"data":[]}'
```

### Issue: All requests sampled (ignoring rate)

**Checks:**
```bash
# Verify sampling configuration
grep OTEL_SAMPLING_RATE .env

# Check if errors are being generated
# Errors are always sampled

# Check if operations are in critical list
grep OTEL_SAMPLING_CRITICAL_OPS .env
```

### Issue: OTLP collector not processing

**Checks:**
```bash
# Check collector health
curl http://localhost:13133

# Check collector logs
docker logs kuybi-otel-collector

# Verify config file
cat configs/otel-collector-config.yaml

# Restart collector
docker restart kuybi-otel-collector
```

### Issue: High memory usage

**Solution:**
```yaml
# Update configs/otel-collector-config.yaml
processors:
  batch:
    send_batch_size: 256  # Reduce from 1024
    send_batch_max_size: 512  # Reduce from 2048
```

---

## Success Criteria

✅ **Phase 3 Complete** when:

1. Intelligent sampling working (10-20% base rate)
2. Errors always sampled (100%)
3. Critical operations always sampled
4. Jaeger showing distributed traces
5. Prometheus scraping metrics
6. Grafana datasources connected
7. <5% performance overhead
8. Docker stack healthy
9. Multiple exporters functional
10. Documentation complete

---

## Next Steps After Testing

### Option 1: Proceed to Production
- [ ] Deploy observability stack to production
- [ ] Update production .env with OTEL_SAMPLING_RATE=0.1
- [ ] Monitor performance and costs
- [ ] Set up alerting rules

### Option 2: Create Dashboards (Phase 3.5)
- [ ] Build Grafana dashboard JSON
- [ ] Add trace visualization panels
- [ ] Create service dependency maps
- [ ] Set up alerting

### Option 3: Advanced Features (Phase 4)
- [ ] GraphQL instrumentation
- [ ] BullMQ queue tracing
- [ ] Microservice correlation
- [ ] Advanced span links

---

## Documentation

- [Phase 3 Plan](../docs/features/observability/PHASE_3_PLAN.md)
- [Observability Stack README](../configs/README.md)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
