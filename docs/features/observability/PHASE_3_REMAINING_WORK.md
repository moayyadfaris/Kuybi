# Phase 3 - Remaining Work & Testing

## 🚧 Current Status

**Branch**: `feature/opentelemetry`

**Completed**:
- ✅ Phase 1: Basic OpenTelemetry setup (PostgreSQL, Redis instrumentation)
- ✅ Phase 2: Cache & HTTP tracing (CacheService, TracingInterceptor)
- ✅ Phase 3 Implementation: Custom sampler, Jaeger/OTLP exporters, Docker stack
- ✅ Phase 3 Infrastructure: Docker Compose, Prometheus alerts, Grafana provisioning
- ✅ Phase 3 Documentation: Testing guide, configuration docs, implementation plan

**Blocked/In Progress**:
- 🔴 HTTP traces not appearing in Jaeger (critical issue identified)
- 🟡 Instrumentation loading order fix (implemented, needs testing)

---

## 🔴 Critical Issue: HTTP Auto-Instrumentation Not Working

### Problem
Only PostgreSQL traces appear in Jaeger console. HTTP request traces are missing despite:
- HTTP auto-instrumentation enabled in `otel-init.ts`
- TracingInterceptor registered globally
- Jaeger exporter active and connected
- 100% sampling rate

### Root Cause Identified
OpenTelemetry HTTP auto-instrumentation requires initialization **BEFORE** Node.js loads the HTTP module. However, `initializeOpenTelemetry()` was being called in `main.ts` after imports, which is too late.

### Solution Implemented (Needs Testing)

**1. Created `src/instrumentation.ts`:**
```typescript
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env BEFORE OpenTelemetry
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { initializeOpenTelemetry } from '@core/observability/instrumentation/otel-init'

// Initialize OpenTelemetry SDK
initializeOpenTelemetry()

console.log('🔧 Instrumentation loaded successfully')
```

**2. Updated `package.json` scripts:**
```json
{
  "start": "NODE_OPTIONS='--require ./dist/instrumentation.js' nest start",
  "start:dev": "NODE_OPTIONS='--require ./dist/instrumentation.js' nest start --watch",
  "start:prod": "node --require ./dist/instrumentation.js dist/main.js"
}
```

**3. Removed duplicate initialization from `main.ts`:**
- Removed `import { initializeOpenTelemetry }` 
- Removed `initializeOpenTelemetry()` call
- Added comment explaining instrumentation is pre-loaded

### Files Modified
- ✅ `src/instrumentation.ts` (NEW)
- ✅ `src/main.ts` (removed duplicate init)
- ✅ `package.json` (updated scripts)
- ⚠️ `src/core/observability/observability.module.ts` (user edited - needs review)

---

## 📋 Remaining Testing Steps

### 1. Verify Instrumentation Loading Order

**Build and start:**
```bash
npm run build
npm run start:dev
```

**Expected console output:**
```
🔧 Instrumentation loaded successfully (OpenTelemetry auto-instrumentation active)
✅ OpenTelemetry initialized successfully
   Service: kuybi-api v0.1.0
   Environment: development
   Sampling: 100% (errors: 100%)
   Exporters: console, jaeger
```

**Check for:**
- ✅ Single initialization (not multiple)
- ✅ Instrumentation loads BEFORE NestJS app
- ✅ All OTEL_* env vars loaded correctly

### 2. Test HTTP Trace Generation

**Send test requests:**
```bash
# Public endpoint (no auth required)
curl -s http://localhost:4040/api/v1/countries | jq

# Health endpoint (note: might be filtered by ignoreIncomingRequestHook)
curl -s http://localhost:4040/api/health | jq
```

**Expected console output:**
```javascript
{
  instrumentationScope: {
    name: '@opentelemetry/instrumentation-http',  // ← Should appear!
    version: '0.53.0'
  },
  name: 'GET /api/v1/countries',
  kind: 1,  // SERVER
  attributes: {
    'http.method': 'GET',
    'http.url': '/api/v1/countries',
    'http.status_code': 200,
    // ... other HTTP attributes
  },
  // Child spans:
  // - pg.query (database)
  // - cache.get (if caching enabled)
}
```

### 3. Verify Jaeger Integration

**Open Jaeger UI:**
```
http://localhost:16686
```

**Search for traces:**
- Service: `kuybi-api`
- Operation: `GET /api/v1/countries`
- Click "Find Traces"

**Expected results:**
- ✅ HTTP request span visible (root span)
- ✅ PostgreSQL query spans as children
- ✅ Cache operation spans (if applicable)
- ✅ Full trace hierarchy visible

### 4. Test Critical Operations Sampling

**Trigger auth.login (always sampled):**
```bash
curl -X POST http://localhost:4040/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@kuybi.dev",
    "password": "Admin@123"
  }'
```

**Expected:**
- ✅ Trace appears even at 10% sampling rate
- ✅ Span attributes include `sampling.reason: "critical_operation"`

### 5. Test Sampling Behavior

**Reduce sampling rate:**
```bash
# Edit .env
OTEL_SAMPLING_RATE=0.1  # 10% sampling
```

**Restart and send 20 requests:**
```bash
for i in {1..20}; do 
  curl -s http://localhost:4040/api/v1/countries > /dev/null
  echo "Request $i sent"
done
```

**Expected:**
- ✅ ~2 traces appear in console (10% of 20)
- ✅ ~2 traces in Jaeger
- ✅ Critical operations still 100% sampled

---

## 🔍 Potential Issues to Check

### Issue 1: Health Endpoint Filtering

**File**: `src/core/observability/instrumentation/otel-init.ts:128-131`

```typescript
ignoreIncomingRequestHook: request => {
  const url = request.url || ''
  return url.includes('/health') || url.includes('/metrics')
}
```

**Problem**: This filters `/api/health` from tracing.

**Fix (if needed)**:
```typescript
ignoreIncomingRequestHook: request => {
  const url = request.url || ''
  // Exact match instead of includes
  return url === '/health' || url === '/metrics' || url === '/api/health' || url === '/api/metrics'
}
```

### Issue 2: TracingInterceptor Conflict

The custom `TracingInterceptor` (Phase 2) might conflict with HTTP auto-instrumentation.

**Test**: Temporarily disable TracingInterceptor to see if HTTP auto-instrumentation works:

**File**: `src/app.module.ts`

Comment out:
```typescript
// {
//   provide: APP_INTERCEPTOR,
//   useClass: TracingInterceptor
// }
```

If HTTP traces appear, we need to:
- Choose ONE approach (auto-instrumentation OR custom interceptor)
- Or modify TracingInterceptor to enhance auto-instrumentation spans instead of creating new ones

### Issue 3: ObservabilityModule Changes

User edited `observability.module.ts` - check if this affects initialization:

```bash
git diff src/core/observability/observability.module.ts
```

---

## 🎯 Success Criteria

Before merging to main, verify:

- [ ] **Console Output**: HTTP spans visible with `@opentelemetry/instrumentation-http`
- [ ] **Jaeger UI**: Full trace hierarchy (HTTP → Database → Cache)
- [ ] **Sampling**: Custom sampler working (10% normal, 100% errors/critical)
- [ ] **Performance**: No blocking operations, <1ms overhead per request
- [ ] **Health Checks**: Health endpoints filtered or traced (decide which)
- [ ] **Documentation**: All guides tested and accurate
- [ ] **Build**: Zero TypeScript errors
- [ ] **Docker Stack**: All services healthy

---

## 📚 Reference Documentation

### Implemented Guides
- `docs/features/observability/PHASE_3_PLAN.md` - Implementation architecture
- `docs/features/observability/PHASE_3_TESTING.md` - Complete testing scenarios
- `configs/README.md` - Observability stack configuration

### Key Configuration Files
- `.env` - OpenTelemetry environment variables
- `docker-compose.observability.yml` - Jaeger, Prometheus, Grafana
- `configs/otel-collector-config.yaml` - OTLP collector pipeline
- `configs/prometheus/alerts.yml` - 11 alerting rules

### Code Files
- `src/instrumentation.ts` - **NEW** Pre-load entry point
- `src/core/observability/instrumentation/otel-init.ts` - OTel SDK initialization
- `src/core/observability/samplers/custom.sampler.ts` - Intelligent sampling
- `src/core/observability/interceptors/tracing.interceptor.ts` - Custom HTTP tracing
- `src/core/cache/services/cache.service.ts` - Cache operation spans

---

## 🚀 Next Steps After Fix

### Phase 3.5: Grafana Dashboards (Optional)
- Create OpenTelemetry dashboard
- HTTP latency percentiles (p50, p95, p99)
- Cache hit rate visualization
- Database query performance
- Trace volume metrics

### Phase 4: GraphQL & Queue Instrumentation
- GraphQL resolver tracing
- Bull queue job spans
- Email queue traces
- Background job monitoring

### Phase 5: Production Readiness
- Load testing with traces
- Performance benchmarks
- Sampling rate optimization
- Alert rule validation
- Runbook documentation

---

## 🐛 Known Issues

1. **HTTP traces missing** (solution implemented, needs testing)
2. **Double initialization** (fixed via instrumentation.ts)
3. **Health endpoint filtering** (may need adjustment)
4. **TracingInterceptor compatibility** (needs investigation)

---

## 💡 Important Notes

### Why Instrumentation Loading Matters

OpenTelemetry auto-instrumentation works by **monkey-patching** Node.js core modules (http, https, net, etc.). This must happen BEFORE those modules are imported by the application.

**Incorrect** (old approach):
```typescript
// main.ts
import { NestFactory } from '@nestjs/core'  // ← HTTP already loaded!
import { initializeOpenTelemetry } from './otel-init'

async function bootstrap() {
  initializeOpenTelemetry()  // ← Too late!
  const app = await NestFactory.create(AppModule)
}
```

**Correct** (new approach):
```typescript
// instrumentation.ts (loaded via --require)
initializeOpenTelemetry()  // ← Loads FIRST

// main.ts
import { NestFactory } from '@nestjs/core'  // ← HTTP patches already applied
async function bootstrap() {
  // No OTel init here
  const app = await NestFactory.create(AppModule)
}
```

### Environment Variables

Ensure `.env` is committed to version control (or document in `.env.example`):

```bash
# OpenTelemetry Configuration
OTEL_ENABLED=true
OTEL_SERVICE_NAME=kuybi-api
OTEL_ENVIRONMENT=development

# Exporters
OTEL_EXPORTER_CONSOLE=true
OTEL_EXPORTER_JAEGER=true
OTEL_EXPORTER_OTLP=false

# Sampling
OTEL_SAMPLING_RATE=1.0              # 100% for development
OTEL_SAMPLING_ERROR_RATE=1.0        # Always sample errors
OTEL_SAMPLING_CRITICAL_OPS=auth.login,auth.logout,story.create
```

### Production Recommendations

When deploying to production:

1. **Lower sampling rate**: `OTEL_SAMPLING_RATE=0.1` (10%)
2. **Enable OTLP exporter**: `OTEL_EXPORTER_OTLP=true`
3. **Disable console exporter**: `OTEL_EXPORTER_CONSOLE=false`
4. **Configure OTLP endpoint**: Point to your observability backend
5. **Resource limits**: Set appropriate batch sizes for your traffic volume

---

## 📞 Resuming Work

When ready to continue:

1. **Pull latest changes** from your pipeline work
2. **Merge any conflicts** in `observability.module.ts`
3. **Run the test sequence** above
4. **Report results**:
   - Do HTTP traces appear in console?
   - Are traces visible in Jaeger UI?
   - Any errors or warnings?

**Quick Start Command:**
```bash
# Clean restart
lsof -ti:4040 | xargs kill -9
npm run build
npm run start:dev

# Wait 15 seconds, then test
sleep 15
curl -s http://localhost:4040/api/v1/countries | jq

# Check console for HTTP span with instrumentationScope.name containing 'instrumentation-http'
```

---

## 📊 Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ instrumentation.ts (--require flag, loads FIRST)            │
│ - Loads .env via dotenv                                     │
│ - Calls initializeOpenTelemetry()                           │
│ - Registers auto-instrumentations                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ main.ts (loads AFTER instrumentation)                       │
│ - HTTP module already patched                               │
│ - Creates NestJS app                                        │
│ - Registers interceptors, filters, pipes                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ HTTP Request Flow                                           │
│                                                              │
│ 1. HTTP Auto-Instrumentation creates root span             │
│ 2. TracingInterceptor enhances with business context       │
│ 3. Database queries create child spans (auto)              │
│ 4. Cache operations create child spans (manual)            │
│ 5. BatchSpanProcessor exports to Jaeger/OTLP               │
└─────────────────────────────────────────────────────────────┘
```

---

**Last Updated**: November 6, 2025  
**Status**: Paused - Awaiting pipeline feature completion  
**Blockers**: HTTP trace visibility (fix implemented, pending test)  
**Next Session**: Test instrumentation loading order fix
