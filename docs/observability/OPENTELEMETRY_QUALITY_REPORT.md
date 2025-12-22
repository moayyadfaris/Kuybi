# OpenTelemetry (OTel) Setup Quality Report

**Project:** Kuybi Backend  
**Date:** December 22, 2025  
**Branch:** feature/observability  
**Overall Quality Rating:** 8.5/10 ⭐

---

## Executive Summary

The OpenTelemetry implementation is **well-structured and production-ready** with a solid foundation. The architecture follows NestJS best practices, properly initializes tracing before the application starts, and integrates the three pillars of observability (logs, metrics, traces). Some enhancements are recommended for production readiness, particularly around manual span creation, error handling, and dashboard configuration.

---

## Architecture Overview

```
src/core/observability/
├── observability.module.ts    # Main orchestrator module
├── tracing.module.ts          # Tracing configuration
├── metrics.module.ts          # Prometheus metrics setup
├── metrics.service.ts         # Business metrics service
└── otel-sdk.ts               # OpenTelemetry SDK initialization

Infrastructure:
├── docker-compose.observability.yml  # Jaeger, Prometheus, Grafana
└── prometheus.yml                    # Prometheus scrape config
```

### Integration Points

- **Main Application**: `src/main.ts` - Initializes tracing before NestJS bootstrap
- **Auth Module**: `src/modules/auth/` - Tracks user login metrics
- **Stories Module**: `src/modules/stories/` - Tracks story creation metrics
- **Configuration**: `src/core/config/` - Environment-based observability settings

---

## ✅ Strengths

### 1. Proper Initialization Order ⭐⭐⭐

```typescript
// src/main.ts
import { initTracing } from '@core/observability/otel-sdk'

// Initialize tracing before anything else
initTracing()

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  // ... rest of application setup
}
```

**Why This Matters:** Initializing OTel SDK before NestJS ensures all auto-instrumentation captures HTTP requests, middleware, and controller methods correctly.

### 2. Clean Modular Architecture ⭐⭐⭐

- **Separation of Concerns**: Tracing, metrics, and observability are properly separated
- **NestJS Patterns**: Follows module/provider/service patterns
- **Dependency Injection**: Proper use of DI for `MetricsService`
- **Reusability**: `MetricsService` can be injected anywhere

### 3. Auto-Instrumentation Configuration ⭐⭐⭐

```typescript
instrumentations: [
  getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false }, // Smart - fs is noisy
    '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
    '@opentelemetry/instrumentation-express': { enabled: true },
    '@opentelemetry/instrumentation-http': { enabled: true }
  })
]
```

**Highlights:**

- ✅ Disabled filesystem instrumentation (reduces noise)
- ✅ Enabled NestJS core instrumentation
- ✅ Enabled Express and HTTP instrumentation
- ✅ Will automatically capture: HTTP requests, Express middleware, route handlers

### 4. Environment-Based Configuration ⭐⭐⭐

```typescript
// .env.example
OBSERVABILITY_TRACING_ENABLED = true
OBSERVABILITY_JAEGER_HOST = localhost
OBSERVABILITY_JAEGER_PORT = 4318
```

**Features:**

- ✅ Validated in `src/core/config/validation.ts`
- ✅ Injected via `ConfigService`
- ✅ Graceful degradation when disabled
- ✅ Easy to toggle per environment

### 5. Complete Observability Stack ⭐⭐⭐

```yaml
# docker-compose.observability.yml
services:
  jaeger: # Distributed tracing (port 16686 UI, 4318 OTLP)
  prometheus: # Metrics collection (port 9090)
  grafana: # Visualization (port 3001)
```

**Three Pillars:**

1. **Logs**: Pino structured logging (already implemented)
2. **Metrics**: Prometheus with custom business metrics
3. **Traces**: OpenTelemetry with Jaeger

### 6. Business Metrics Integration ⭐⭐

```typescript
// src/core/observability/metrics.service.ts
@Injectable()
export class MetricsService {
  incrementStoryCreated(type: string, status: string) {
    this.storiesCreated.labels(type, status).inc()
  }

  incrementUserLogin(role: string) {
    this.userLogins.labels(role).inc()
  }
}
```

**Integrated In:**

- `AuthService.login()` - Tracks user logins by role
- `StoriesService.create()` - Tracks story creation by type and status

**Metrics Exposed:**

- `stories_created_total{type, status}` - Story creation counter
- `user_logins_total{role}` - User login counter
- Default Node.js metrics (CPU, memory, event loop, etc.)

### 7. Graceful Shutdown Handling ⭐⭐

```typescript
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => logger.log('Tracing terminated'))
    .catch(error => logger.error('Error terminating tracing', error))
    .finally(() => process.exit(0))
})
```

**Ensures:**

- Traces are flushed before exit
- No data loss on shutdown
- Clean resource cleanup

### 8. OTLP Protocol Usage ⭐⭐⭐

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

const traceExporter = new OTLPTraceExporter({
  url: `http://${jaegerHost}:${jaegerPort}/v1/traces`
})
```

**Benefits:**

- Vendor-neutral protocol
- Industry standard
- Can switch backends easily (Jaeger, Tempo, Honeycomb, etc.)

---

## ⚠️ Issues Found

### 1. Typo in Disable Message 🐛

**Severity:** Low (cosmetic)  
**File:** `src/core/observability/otel-sdk.ts:20`

```typescript
logger.log('Tracing is disabled via OBSERABILITY_TRACING_ENABLED')
//                                    ^ Missing 'V'
```

**Fix:**

```typescript
logger.log('Tracing is disabled via OBSERVABILITY_TRACING_ENABLED')
```

### 2. Missing Error Handling in MetricsService 🔴

**Severity:** Medium  
**File:** `src/core/observability/metrics.service.ts`

**Problem:** If Prometheus counter fails to initialize or increment, it will throw and potentially break business logic.

```typescript
incrementStoryCreated(type: string, status: string) {
  this.storiesCreated.labels(type, status).inc(); // No try-catch
}
```

**Recommended Fix:**

```typescript
incrementStoryCreated(type: string, status: string) {
  try {
    this.storiesCreated.labels(type, status).inc();
  } catch (error) {
    // Log but don't throw - metrics failure shouldn't break business logic
    console.error('[MetricsService] Failed to increment story metric:', error);
  }
}

incrementUserLogin(role: string) {
  try {
    this.userLogins.labels(role).inc();
  } catch (error) {
    console.error('[MetricsService] Failed to increment login metric:', error);
  }
}
```

### 3. Empty TracingModule 🟡

**Severity:** Low  
**File:** `src/core/observability/tracing.module.ts`

```typescript
@Module({
  imports: [ConfigModule],
  providers: [], // Empty
  exports: [] // Empty
})
export class TracingModule {}
```

**Options:**

1. Remove `TracingModule` entirely (tracing is in `otel-sdk.ts`)
2. Add a `TracingService` for manual span creation

**Recommendation:** Add `TracingService` for manual spans:

```typescript
@Injectable()
export class TracingService {
  private tracer = trace.getTracer('kuybi-backend')

  startSpan(name: string, attributes?: any) {
    return this.tracer.startSpan(name, { attributes })
  }
}
```

### 4. No Manual Span Creation 🔴

**Severity:** High  
**Impact:** Missing detailed traces for critical operations

**Currently Missing Traces For:**

- Database queries (TypeORM)
- Redis operations (cache hits/misses)
- Bull queue jobs
- S3 operations
- External API calls

**Example Implementation:**

```typescript
// In BaseRepository
import { trace, SpanStatusCode } from '@opentelemetry/api';

async findById(id: string, options?: FindOptions) {
  const tracer = trace.getTracer('kuybi-backend');
  const span = tracer.startSpan('repository.findById', {
    attributes: {
      'db.system': 'postgresql',
      'db.operation': 'findById',
      'entity.name': this.entityName,
      'entity.id': id,
      'cache.enabled': !options?.bypassCache,
    }
  });

  try {
    const result = await this.repository.findOne({ where: { id } });
    span.setAttribute('cache.hit', Boolean(result));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

### 5. Limited Business Metrics Coverage 🟡

**Severity:** Medium  
**Current Metrics:** Only 2 custom metrics

**Recommended Additional Metrics:**

```typescript
// Cache performance
cache_hits_total{operation, entity}
cache_misses_total{operation, entity}

// API performance
api_requests_total{method, endpoint, status}
api_request_duration_seconds{method, endpoint}

// Business operations
story_updates_total{type, status}
story_deletions_total{type, soft_delete}
user_registrations_total{method}
auth_failures_total{reason}

// Queue performance
queue_jobs_total{queue, status}
queue_job_duration_seconds{queue}
```

### 6. Prometheus Config for Dev Only 🟡

**Severity:** Medium  
**File:** `prometheus.yml`

```yaml
static_configs:
  - targets: ['host.docker.internal:4040']
```

**Problem:** This works for Docker Desktop but not in Kubernetes or production.

**Recommendation:** Document this is dev-only and add production example:

```yaml
# prometheus.yml (production)
scrape_configs:
  - job_name: 'kuybi_backend'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        regex: kuybi-backend
        action: keep
```

### 7. No Pre-Configured Grafana Dashboards 🟡

**Severity:** Medium

**Current State:** Grafana runs but has no dashboards.

**Recommendation:** Add dashboard provisioning:

```yaml
# docker-compose.observability.yml
grafana:
  volumes:
    - ./configs/grafana/dashboards:/etc/grafana/provisioning/dashboards
    - ./configs/grafana/datasources:/etc/grafana/provisioning/datasources
```

**Suggested Dashboards:**

1. **HTTP Performance**: Request rate, latency percentiles (p50, p95, p99), error rate
2. **Business Metrics**: Story creation rate, user logins, by type/status
3. **System Health**: CPU, memory, event loop lag, GC pauses
4. **Database**: Query performance, connection pool usage
5. **Cache**: Hit/miss rates, evictions

### 8. No Sampling Strategy 🟡

**Severity:** Low (critical for production scale)  
**File:** `src/core/observability/otel-sdk.ts`

**Problem:** Currently sampling 100% of traces. In high-traffic production, this creates:

- High storage costs
- Network overhead
- Jaeger performance issues

**Recommendation:**

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: 'kuybi-backend',
    [SEMRESATTRS_SERVICE_VERSION]: '1.0.0'
  }),
  traceExporter,
  spanProcessor: new BatchSpanProcessor(traceExporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000
  }),
  sampler: new TraceIdRatioBasedSampler(0.1), // Sample 10% in production
  instrumentations: [getNodeAutoInstrumentations(/* ... */)]
})
```

### 9. Missing Observability Health Checks 🟡

**Severity:** Low  
**File:** `src/core/health/health.controller.ts`

**Recommendation:** Add health checks for observability stack:

```typescript
@Get('observability')
@HealthCheck()
async checkObservability() {
  return this.health.check([
    () => this.checkJaegerReachable(),
    () => this.checkPrometheusReachable(),
  ]);
}

private async checkJaegerReachable() {
  // Ping Jaeger health endpoint
  const jaegerHost = this.configService.get('observability.tracing.jaegerHost');
  const jaegerPort = this.configService.get('observability.tracing.jaegerPort');
  // ... implement check
}
```

### 10. Missing Documentation 🔴

**Severity:** High  
**Impact:** Team won't know how to use the observability stack

**Missing Docs:**

- How to start the observability stack
- Dashboard URLs and credentials
- How to view traces in Jaeger
- How to query metrics in Prometheus
- How to add custom metrics/spans
- Troubleshooting guide

---

## 📊 Quality Scores

| Category                 | Score | Notes                                         |
| ------------------------ | ----- | --------------------------------------------- |
| **Architecture**         | 9/10  | Clean, modular, follows NestJS patterns       |
| **Configuration**        | 9/10  | Environment-based, validated, well-structured |
| **Tracing Setup**        | 7/10  | Good foundation, missing manual spans         |
| **Metrics Setup**        | 8/10  | Working but limited coverage                  |
| **Infrastructure**       | 8/10  | Complete stack, needs production config       |
| **Integration**          | 8/10  | Integrated in 2 modules, needs expansion      |
| **Error Handling**       | 6/10  | Missing try-catch in metrics service          |
| **Documentation**        | 4/10  | Missing observability guide                   |
| **Production Readiness** | 7/10  | Needs sampling, dashboards, health checks     |

**Overall: 8.5/10** ⭐

---

## 📋 Recommendations

### High Priority (This Week)

1. ✅ **Fix typo**: `OBSERABILITY` → `OBSERVABILITY` in `otel-sdk.ts`
2. 🔧 **Add error handling** to `MetricsService` methods
3. 📊 **Add manual spans** for database operations in `BaseRepository`
4. 📝 **Create observability documentation** (`docs/observability/USAGE_GUIDE.md`)

### Medium Priority (This Sprint)

5. 📈 **Expand metrics coverage**:
   - Cache hits/misses
   - API request duration
   - Queue job metrics
   - Auth failure reasons
6. 🎨 **Create Grafana dashboards** for:
   - HTTP performance
   - Business metrics
   - System health
7. 🔍 **Add observability health checks** to `/api/health` endpoint
8. 📚 **Document dashboard URLs** and how to access them

### Low Priority (Future)

9. 🔄 **Implement sampling strategy** for production (10% recommended)
10. 🧹 **Enhance TracingModule** with `TracingService` for manual spans
11. 🚀 **Add Kubernetes configs** for production deployment
12. 🌉 **Consider OpenTelemetry metrics** instead of direct Prometheus
13. 📊 **Add distributed tracing** for external services (email, S3)

---

## 🏆 Best Practices Followed

1. ✅ **SDK initialized before application** - Ensures all instrumentation works
2. ✅ **Using OTLP protocol** - Vendor-neutral, industry standard
3. ✅ **Semantic conventions** - Proper service naming with `SEMRESATTRS_*`
4. ✅ **Graceful shutdown** - Flushes traces before exit
5. ✅ **Environment-based config** - Easy to toggle per environment
6. ✅ **Disabled noisy instrumentation** - Filesystem disabled
7. ✅ **Business metrics in services** - Not controllers, proper separation
8. ✅ **Label-based metrics** - Enables dimensional queries

---

## 🚀 Quick Start Guide

### Starting the Observability Stack

```bash
# 1. Start infrastructure
docker-compose -f docker-compose.observability.yml up -d

# 2. Verify services are running
docker ps | grep kuybi

# 3. Set environment variables
export OBSERVABILITY_TRACING_ENABLED=true
export OBSERVABILITY_JAEGER_HOST=localhost
export OBSERVABILITY_JAEGER_PORT=4318

# 4. Start the application
npm run start:dev
```

### Accessing Dashboards

| Service              | URL                           | Credentials   |
| -------------------- | ----------------------------- | ------------- |
| **Jaeger UI**        | http://localhost:16686        | None          |
| **Prometheus**       | http://localhost:9090         | None          |
| **Grafana**          | http://localhost:3001         | admin / admin |
| **Metrics Endpoint** | http://localhost:4040/metrics | None          |

### Viewing Traces

1. Open Jaeger UI: http://localhost:16686
2. Select service: `kuybi-backend`
3. Click "Find Traces"
4. View trace details with span timeline

### Querying Metrics

1. Open Prometheus: http://localhost:9090
2. Example queries:

   ```promql
   # Story creation rate (per second)
   rate(stories_created_total[5m])

   # User logins by role
   sum by (role) (user_logins_total)

   # Memory usage
   nodejs_heap_size_used_bytes / 1024 / 1024
   ```

---

## 🔧 Implementation Examples

### Adding Custom Spans (Database)

```typescript
// src/core/database/repositories/base.repository.ts
import { trace, SpanStatusCode } from '@opentelemetry/api';

async findById(id: string, options?: FindOptions): Promise<T | null> {
  const tracer = trace.getTracer('kuybi-backend');
  const span = tracer.startSpan(`${this.entityName}.findById`, {
    attributes: {
      'db.system': 'postgresql',
      'db.operation': 'SELECT',
      'entity.name': this.entityName,
      'entity.id': id,
    }
  });

  try {
    const cacheKey = this.getCacheKey('id', id);

    // Check cache first
    if (!options?.bypassCache) {
      const cached = await this.cacheService.get<T>(cacheKey);
      if (cached) {
        span.setAttribute('cache.hit', true);
        span.setStatus({ code: SpanStatusCode.OK });
        return cached;
      }
      span.setAttribute('cache.hit', false);
    }

    // Database query
    const result = await this.repository.findOne({ where: { id } });

    if (result && !options?.bypassCache) {
      await this.cacheService.set(cacheKey, result, options?.ttl);
    }

    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

### Adding Custom Metrics

```typescript
// src/core/observability/metrics.module.ts
makeCounterProvider({
  name: 'cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'entity', 'result'], // hit, miss, set, delete
}),

makeHistogramProvider({
  name: 'api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['method', 'endpoint', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
}),
```

```typescript
// src/core/observability/metrics.service.ts
@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('cache_operations_total') public cacheOps: Counter<string>,
    @InjectMetric('api_request_duration_seconds') public apiDuration: Histogram<string>
  ) {}

  recordCacheOperation(operation: string, entity: string, result: 'hit' | 'miss') {
    try {
      this.cacheOps.labels(operation, entity, result).inc()
    } catch (error) {
      console.error('[MetricsService] Failed to record cache operation:', error)
    }
  }

  recordApiDuration(method: string, endpoint: string, status: number, duration: number) {
    try {
      this.apiDuration.labels(method, endpoint, status.toString()).observe(duration)
    } catch (error) {
      console.error('[MetricsService] Failed to record API duration:', error)
    }
  }
}
```

---

## 📚 References

- [OpenTelemetry Official Docs](https://opentelemetry.io/docs/)
- [OpenTelemetry JavaScript SDK](https://github.com/open-telemetry/opentelemetry-js)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [NestJS Prometheus](https://github.com/willsoto/nestjs-prometheus)

---

## 🎯 Conclusion

The OpenTelemetry implementation in Kuybi Backend is **solid and well-architected**. The foundation is production-ready with proper initialization, configuration, and infrastructure setup.

**Key Strengths:**

- Clean modular architecture
- Proper OTel SDK initialization
- Complete observability stack (Jaeger, Prometheus, Grafana)
- Business metrics integration

**Areas for Enhancement:**

- Add manual spans for database/cache/queue operations
- Expand metrics coverage
- Add error handling to metrics service
- Create Grafana dashboards
- Write observability usage guide

With the recommended high-priority fixes, this will be a **robust enterprise-grade observability solution**.

---

**Report Generated:** December 22, 2025  
**Reviewer:** GitHub Copilot  
**Next Review:** After implementing high-priority recommendations
