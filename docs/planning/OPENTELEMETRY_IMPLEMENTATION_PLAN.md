# OpenTelemetry + Metrics Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding OpenTelemetry (OTel) distributed tracing and Prometheus metrics to the Kuybi NestJS application. This will provide enterprise-grade observability alongside existing Pino logging and Sentry error tracking.

**Timeline**: 2-3 weeks  
**Complexity**: Medium  
**Priority**: High (Critical for production monitoring)

---

## Current State Analysis

### ✅ Existing Observability Stack
- **Logging**: Pino with structured logging, rotation, and archival
- **Error Tracking**: Sentry with profiling and distributed tracing capability
- **Health Checks**: Terminus health checks for DB, Redis, queues
- **Queue Monitoring**: Bull Board dashboard for BullMQ queues
- **Request Tracking**: Request ID middleware and correlation IDs

### ❌ Gaps to Address
- **No distributed tracing** across services (future microservices)
- **No custom business metrics** (story views, user signups, API usage)
- **No performance metrics** (response times, DB query duration, cache hit rates)
- **No Prometheus export** for Kubernetes/Grafana integration
- **Limited visibility** into queue processing performance
- **No SLA/SLO tracking** capabilities

---

## Goals & Objectives

### Primary Goals
1. **Distributed Tracing**: Track requests across services, DB, Redis, queues
2. **Performance Metrics**: Collect HTTP, DB, cache, and queue metrics
3. **Business Metrics**: Track KPIs (story creation, user engagement, API usage)
4. **Standard Export**: Prometheus format for industry-standard tooling
5. **Low Overhead**: <5% performance impact in production

### Success Criteria
- ✅ All HTTP requests traced with <10ms overhead
- ✅ Database queries correlated with parent HTTP spans
- ✅ Custom metrics exported every 15 seconds
- ✅ Grafana dashboards showing key metrics
- ✅ Integration with existing Sentry without conflicts

---

## Architecture Design

### Technology Stack

```typescript
// Core OpenTelemetry
@opentelemetry/sdk-node                 // OTel SDK
@opentelemetry/auto-instrumentations-node // Auto-instrumentation
@opentelemetry/exporter-trace-otlp-http  // OTLP exporter
@opentelemetry/exporter-prometheus       // Prometheus exporter

// Metrics
prom-client                             // Prometheus client
@opentelemetry/api-metrics              // Metrics API

// Instrumentation
@opentelemetry/instrumentation-http     // HTTP tracing
@opentelemetry/instrumentation-express  // Express middleware
@opentelemetry/instrumentation-pg       // PostgreSQL queries
@opentelemetry/instrumentation-redis-4  // Redis operations
@opentelemetry/instrumentation-pino     // Log correlation
```

### Deployment Options

#### Option 1: Jaeger (Recommended for Development)
- **Pros**: Easy local setup, all-in-one solution, great UI
- **Cons**: Not ideal for production scale
- **Use Case**: Development and testing

#### Option 2: Grafana Stack (Recommended for Production)
- **Tempo**: Distributed tracing backend
- **Prometheus**: Metrics storage
- **Grafana**: Unified dashboards
- **Loki**: Log aggregation (optional, we have Pino)
- **Pros**: Production-grade, scalable, unified observability
- **Cons**: More complex setup

#### Option 3: Cloud Providers
- **AWS X-Ray + CloudWatch**: Native AWS integration
- **Google Cloud Trace + Monitoring**: Native GCP
- **Datadog/New Relic**: SaaS APM ($$$ but zero maintenance)

**Decision**: Start with Jaeger (dev) + Grafana Stack (staging/prod)

---

## Implementation Phases

### Phase 1: Foundation & HTTP Tracing (Week 1)

#### 1.1 Install Dependencies
```bash
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-prometheus \
  @opentelemetry/api \
  @opentelemetry/instrumentation-http \
  @opentelemetry/instrumentation-express \
  prom-client
```

#### 1.2 Create OTel Module Structure
```
src/core/observability/
├── observability.module.ts
├── config/
│   ├── otel.config.ts              # OpenTelemetry configuration
│   └── metrics.config.ts           # Metrics configuration
├── tracing/
│   ├── tracing.service.ts          # Tracing facade
│   ├── span.decorator.ts           # @Trace() decorator
│   └── trace.interceptor.ts        # Auto-tracing interceptor
├── metrics/
│   ├── metrics.service.ts          # Metrics facade
│   ├── prometheus.controller.ts    # /metrics endpoint
│   ├── decorators/
│   │   ├── counter.decorator.ts    # @Counter()
│   │   ├── histogram.decorator.ts  # @Histogram()
│   │   └── gauge.decorator.ts      # @Gauge()
│   └── collectors/
│       ├── http.collector.ts       # HTTP metrics
│       ├── database.collector.ts   # DB metrics
│       ├── cache.collector.ts      # Redis metrics
│       └── queue.collector.ts      # BullMQ metrics
└── instrumentation/
    └── otel-init.ts                # OTel bootstrap (loaded before app)
```

#### 1.3 Basic Configuration
```typescript
// src/core/observability/config/otel.config.ts
export interface OtelConfig {
  enabled: boolean
  serviceName: string
  serviceVersion: string
  environment: string
  
  tracing: {
    enabled: boolean
    sampleRate: number // 0.0 to 1.0
    exporter: 'jaeger' | 'otlp' | 'console'
    endpoint?: string
  }
  
  metrics: {
    enabled: boolean
    endpoint: string // e.g., /metrics
    port?: number    // Separate metrics port (optional)
    interval: number // Export interval in ms
  }
}
```

#### 1.4 Environment Variables
```bash
# .env.example additions
OTEL_ENABLED=true
OTEL_SERVICE_NAME=kuybi-nest
OTEL_SERVICE_VERSION=0.1.0
OTEL_ENVIRONMENT=development

# Tracing
OTEL_TRACING_ENABLED=true
OTEL_TRACING_SAMPLE_RATE=1.0
OTEL_TRACING_EXPORTER=console
OTEL_JAEGER_ENDPOINT=http://localhost:14268/api/traces
OTEL_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Metrics
OTEL_METRICS_ENABLED=true
OTEL_METRICS_ENDPOINT=/metrics
OTEL_METRICS_PORT=9464
OTEL_METRICS_INTERVAL=15000
```

#### 1.5 Bootstrap OTel Before NestJS
```typescript
// src/instrumentation/otel-init.ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'

export function initializeOpenTelemetry() {
  if (process.env.OTEL_ENABLED !== 'true') {
    return
  }

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'kuybi-nest',
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation()
    ],
    // Configure exporters based on env
  })

  sdk.start()
  
  process.on('SIGTERM', () => {
    sdk.shutdown()
  })
}

// src/main.ts - ADD THIS AT THE TOP
import './instrumentation/otel-init'
initializeOpenTelemetry()

async function bootstrap() {
  // ... existing code
}
```

#### 1.6 HTTP Tracing Interceptor
```typescript
// src/core/observability/tracing/trace.interceptor.ts
@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest()
    const trace = api.trace.getActiveSpan()
    
    if (trace) {
      trace.setAttributes({
        'http.route': request.route?.path,
        'http.controller': context.getClass().name,
        'http.handler': context.getHandler().name,
        'user.id': request.user?.id
      })
    }
    
    return next.handle()
  }
}
```

**Deliverables**:
- ✅ OTel SDK initialized and configured
- ✅ HTTP requests automatically traced
- ✅ Trace IDs in Pino logs (correlation)
- ✅ Basic `/metrics` endpoint (placeholder)
- ✅ Jaeger UI showing traces locally

---

### Phase 2: Database & Redis Instrumentation (Week 1-2)

#### 2.1 PostgreSQL Tracing
```bash
npm install @opentelemetry/instrumentation-pg
```

```typescript
// Add to otel-init.ts
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'

instrumentations: [
  new PgInstrumentation({
    enhancedDatabaseReporting: true,
    responseHook: (span, result) => {
      span.setAttribute('db.rows_returned', result.rowCount)
    }
  })
]
```

**Metrics to Capture**:
- Query duration histogram
- Queries per second
- Connection pool usage
- Slow query alerts (>100ms)

#### 2.2 Redis Tracing
```bash
npm install @opentelemetry/instrumentation-redis-4
```

```typescript
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4'

instrumentations: [
  new RedisInstrumentation({
    dbStatementSerializer: (cmdName, cmdArgs) => {
      // Sanitize sensitive data
      return cmdName
    }
  })
]
```

**Metrics to Capture**:
- Cache hit/miss ratio
- Operation duration
- Connection pool stats
- Commands per second

#### 2.3 Custom Database Metrics
```typescript
// src/core/observability/metrics/collectors/database.collector.ts
@Injectable()
export class DatabaseMetricsCollector {
  private queryDuration: Histogram
  private activeConnections: Gauge
  private queryErrors: Counter
  
  constructor(private metricsService: MetricsService) {
    this.queryDuration = metricsService.createHistogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration',
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    })
    
    this.activeConnections = metricsService.createGauge({
      name: 'db_connections_active',
      help: 'Active database connections'
    })
  }
  
  recordQuery(duration: number, query: string, success: boolean) {
    this.queryDuration.observe({ query_type: this.getQueryType(query) }, duration)
    if (!success) {
      this.queryErrors.inc()
    }
  }
}
```

**Deliverables**:
- ✅ All DB queries traced with duration
- ✅ Redis operations traced
- ✅ Database metrics exposed on /metrics
- ✅ Cache hit/miss ratio visible

---

### Phase 3: Custom Business Metrics (Week 2)

#### 3.1 Metrics Decorators
```typescript
// src/core/observability/metrics/decorators/counter.decorator.ts
export function Counter(name: string, help: string, labels?: string[]) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    
    descriptor.value = async function(...args: any[]) {
      const metricsService = this.metricsService || getGlobalMetrics()
      const counter = metricsService.getOrCreateCounter(name, help, labels)
      
      counter.inc()
      return originalMethod.apply(this, args)
    }
  }
}

// Usage in service
export class StoryService {
  @Counter('stories_created_total', 'Total stories created', ['status'])
  async create(dto: CreateStoryDto) {
    // ... existing logic
  }
}
```

#### 3.2 Business KPIs to Track
```typescript
// Story metrics
stories_created_total{status="draft|published"}
stories_view_count
stories_published_duration_seconds
stories_version_count

// User metrics
users_registered_total
users_active_daily
users_login_total{success="true|false"}
users_locked_total

// API metrics
api_requests_total{method, route, status_code}
api_request_duration_seconds{method, route}
api_errors_total{type, route}

// Queue metrics
queue_jobs_total{queue_name, status}
queue_processing_duration_seconds{queue_name}
queue_backlog_size{queue_name}
queue_failures_total{queue_name, reason}

// Cache metrics
cache_operations_total{operation="get|set|delete", hit="true|false"}
cache_size_bytes{cache_name}
cache_evictions_total

// Attachment metrics
attachments_uploaded_total{type="image|document|video"}
attachments_size_bytes{type}
attachments_processing_duration_seconds{operation}
```

#### 3.3 HTTP Metrics Middleware
```typescript
// src/core/observability/metrics/collectors/http.collector.ts
@Injectable()
export class HttpMetricsCollector {
  private requestDuration: Histogram
  private requestsTotal: Counter
  private activeRequests: Gauge
  
  constructor(private metricsService: MetricsService) {
    this.requestDuration = metricsService.createHistogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
    })
    
    this.requestsTotal = metricsService.createCounter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    })
  }
  
  recordRequest(method: string, route: string, statusCode: number, duration: number) {
    const labels = { method, route, status_code: statusCode.toString() }
    this.requestDuration.observe(labels, duration)
    this.requestsTotal.inc(labels)
  }
}
```

**Deliverables**:
- ✅ Business metrics decorators (@Counter, @Histogram, @Gauge)
- ✅ HTTP metrics auto-collected
- ✅ Queue metrics from Bull Board integration
- ✅ Custom KPIs tracked (story creation, user signups)

---

### Phase 4: Integration & Dashboards (Week 2-3)

#### 4.1 Prometheus Configuration
```yaml
# prometheus.yml (local development)
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'kuybi-nest'
    static_configs:
      - targets: ['localhost:9464']
    metrics_path: '/metrics'
```

#### 4.2 Grafana Dashboards

**Dashboard 1: Service Overview**
- Request rate (req/sec)
- Average response time
- Error rate
- P95/P99 latency
- Active connections (DB, Redis)

**Dashboard 2: Business KPIs**
- Stories created (last 24h)
- User registrations
- API usage by endpoint
- Queue processing rates
- Cache hit ratio

**Dashboard 3: Database Performance**
- Query duration (avg, p95, p99)
- Slow queries (>100ms)
- Connection pool usage
- Deadlocks/errors

**Dashboard 4: Queue Health**
- Jobs processed/sec
- Queue backlog size
- Processing duration
- Failed jobs ratio
- Worker utilization

#### 4.3 Alerting Rules
```yaml
# prometheus-alerts.yml
groups:
  - name: kuybi_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"
          
      - alert: SlowDatabaseQueries
        expr: histogram_quantile(0.95, db_query_duration_seconds) > 1
        for: 10m
        annotations:
          summary: "95th percentile query time > 1s"
          
      - alert: QueueBacklog
        expr: queue_backlog_size > 1000
        for: 15m
        annotations:
          summary: "Queue backlog exceeds 1000 jobs"
```

#### 4.4 Correlation with Logs & Errors

**Pino Log Correlation**:
```typescript
// Add trace_id to every log entry
import { context, trace } from '@opentelemetry/api'

const span = trace.getSpan(context.active())
if (span) {
  logger.child({
    trace_id: span.spanContext().traceId,
    span_id: span.spanContext().spanId
  })
}
```

**Sentry Integration**:
```typescript
// Add trace context to Sentry events
import * as Sentry from '@sentry/node'

Sentry.setContext('trace', {
  trace_id: span.spanContext().traceId,
  span_id: span.spanContext().spanId
})
```

**Deliverables**:
- ✅ Prometheus scraping Kuybi metrics
- ✅ 4 Grafana dashboards (Service, Business, DB, Queues)
- ✅ Alert rules configured
- ✅ Trace IDs in logs and Sentry
- ✅ End-to-end request tracing (HTTP → DB → Queue)

---

## Testing Strategy

### Unit Tests
```typescript
describe('MetricsService', () => {
  it('should create counter and increment', () => {
    const counter = metricsService.createCounter('test_counter', 'Test')
    counter.inc()
    expect(metricsService.getMetricValue('test_counter')).toBe(1)
  })
})
```

### Integration Tests
```typescript
describe('Tracing Integration', () => {
  it('should create span for HTTP request', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/stories')
      .expect(200)
    
    // Verify span was created
    const spans = getTestSpans()
    expect(spans).toHaveLength(1)
    expect(spans[0].name).toBe('GET /api/stories')
  })
})
```

### Load Testing
```bash
# k6 script to verify metrics under load
npm run test:load
```

---

## Performance Considerations

### Expected Overhead
- **Tracing**: 5-10ms per traced operation
- **Metrics**: ~1ms for metric updates
- **Memory**: +20-50MB for SDK and exporters
- **Total Impact**: <5% in production with 10% sample rate

### Optimization Strategies
1. **Sample Rate**: Use 10-20% in production, 100% in dev
2. **Batch Export**: Export traces in batches every 5 seconds
3. **Async Metrics**: Use background thread for metric exports
4. **Selective Instrumentation**: Don't trace health check endpoints
5. **Cardinality Control**: Limit metric label combinations

---

## Rollout Plan

### Development (Week 1)
- Install OTel SDK
- Setup Jaeger locally (`docker run -d -p16686:16686 -p14268:14268 jaegertracing/all-in-one`)
- Enable HTTP and DB tracing
- View traces in Jaeger UI

### Staging (Week 2)
- Deploy Grafana Stack (Tempo + Prometheus + Grafana)
- Enable all instrumentations
- Create dashboards
- Configure alerts
- Load test with realistic traffic

### Production (Week 3)
- Start with 10% sample rate
- Monitor overhead
- Gradually increase to 20%
- Enable alerting
- Train team on dashboards

---

## Success Metrics

### Week 1
- ✅ HTTP requests traced successfully
- ✅ DB queries show up in traces
- ✅ Jaeger UI accessible locally

### Week 2
- ✅ All business metrics exported
- ✅ Grafana dashboards functional
- ✅ Queue metrics correlated with jobs
- ✅ <10ms tracing overhead

### Week 3
- ✅ Alerts firing correctly
- ✅ Production deployment successful
- ✅ Team trained on observability tools
- ✅ Incident response time reduced by 50%

---

## Migration from Sentry

**Strategy**: Run both systems in parallel

- **Sentry**: Keep for error tracking and alerting
- **OpenTelemetry**: Use for tracing and metrics
- **Correlation**: Link Sentry events to OTel traces

**Why Both?**:
- Sentry: Better error grouping, release tracking, issue management
- OTel: Better performance monitoring, distributed tracing, metrics

**Future**: Consider Sentry's OTel support (currently in beta)

---

## Cost Estimate

### Self-Hosted (Recommended)
- **Grafana Cloud Free Tier**: 50GB metrics, 50GB traces (likely enough)
- **AWS EC2 (t3.medium)**: $30/month for Prometheus + Tempo + Grafana
- **Storage**: $20/month for 100GB retention
- **Total**: ~$50/month or FREE with Grafana Cloud

### SaaS Options
- **Datadog**: $15-31/host/month (~$500-1000/month for 10 hosts)
- **New Relic**: $99-349/user/month
- **Honeycomb**: $200-1000/month

**Recommendation**: Start with Grafana Cloud Free Tier

---

## Next Steps

### Immediate Actions (This Week)
1. Create feature branch: `git checkout -b feature/opentelemetry`
2. Install OTel dependencies
3. Create observability module structure
4. Setup Jaeger locally with Docker
5. Implement Phase 1 (HTTP tracing)

### Week 1 Review
- Demo HTTP tracing in Jaeger
- Show trace correlation with logs
- Review performance overhead
- Decide on production backend (Tempo vs cloud)

### Week 2-3
- Implement database/Redis instrumentation
- Create custom business metrics
- Build Grafana dashboards
- Deploy to staging
- Load test and optimize

---

## References & Resources

### Documentation
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/instrumentation/js/)
- [NestJS + OTel Guide](https://docs.nestjs.com/recipes/opentelemetry)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)

### Tools
- [Jaeger](https://www.jaegertracing.io/)
- [Grafana Tempo](https://grafana.com/oss/tempo/)
- [Prometheus](https://prometheus.io/)
- [K6 Load Testing](https://k6.io/)

### Learning
- [OTel Collector Tutorial](https://opentelemetry.io/docs/collector/)
- [Distributed Tracing Fundamentals](https://microservices.io/patterns/observability/distributed-tracing.html)

---

## Questions & Decisions Needed

1. **Backend Choice**: Jaeger (dev) + Grafana Cloud (prod) OK?
2. **Sample Rate**: Start with 10% in production?
3. **Metrics Port**: Separate port (9464) or same as app (4040/metrics)?
4. **Alert Channel**: Slack? PagerDuty? Email?
5. **Retention**: How long to keep traces (7 days?) and metrics (30 days?)?

---

**Status**: 📋 Planning Phase  
**Owner**: TBD  
**Start Date**: TBD  
**Target Completion**: 3 weeks from start

---

*This plan will be updated as implementation progresses.*
