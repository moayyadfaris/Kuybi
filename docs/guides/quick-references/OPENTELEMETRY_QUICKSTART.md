# OpenTelemetry + Metrics Quick Start Guide

**TL;DR**: Get distributed tracing and Prometheus metrics running in 30 minutes.

---

## Prerequisites

- Docker installed (for Jaeger)
- Kuybi application running
- Node.js 20+

---

## Phase 1: Local Development Setup (30 mins)

### Step 1: Start Jaeger (2 mins)

```bash
# Start Jaeger all-in-one (includes UI, collector, and storage)
docker run -d \
  --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  -p 14250:14250 \
  jaegertracing/all-in-one:latest

# Verify Jaeger is running
open http://localhost:16686
```

### Step 2: Install Dependencies (3 mins)

```bash
# Core OpenTelemetry packages
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-prometheus \
  @opentelemetry/api

# Instrumentation packages
npm install --save \
  @opentelemetry/instrumentation-http \
  @opentelemetry/instrumentation-express \
  @opentelemetry/instrumentation-pg \
  @opentelemetry/instrumentation-redis-4 \
  prom-client
```

### Step 3: Environment Variables (2 mins)

```bash
# Add to .env
cat >> .env << 'EOF'

# OpenTelemetry Configuration
OTEL_ENABLED=true
OTEL_SERVICE_NAME=kuybi-nest
OTEL_SERVICE_VERSION=0.1.0
OTEL_ENVIRONMENT=development

# Tracing
OTEL_TRACING_ENABLED=true
OTEL_TRACING_SAMPLE_RATE=1.0
OTEL_TRACING_EXPORTER=jaeger
OTEL_JAEGER_ENDPOINT=http://localhost:14268/api/traces

# Metrics
OTEL_METRICS_ENABLED=true
OTEL_METRICS_ENDPOINT=/metrics
OTEL_METRICS_PORT=9464
EOF
```

### Step 4: Create OTel Bootstrap (10 mins)

```bash
# Create instrumentation directory
mkdir -p src/instrumentation
```

Create `src/instrumentation/otel-init.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

let sdk: NodeSDK | null = null

export function initializeOpenTelemetry() {
  // Check if OTel is enabled
  if (process.env.OTEL_ENABLED !== 'true') {
    console.log('OpenTelemetry disabled')
    return
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || 'kuybi-nest'
  const serviceVersion = process.env.OTEL_SERVICE_VERSION || '0.1.0'
  const environment = process.env.OTEL_ENVIRONMENT || 'development'

  // Create resource
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    'deployment.environment': environment
  })

  // Configure trace exporter (Jaeger)
  const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_JAEGER_ENDPOINT || 'http://localhost:14268/api/traces'
  })

  // Initialize SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false // Disable fs to reduce noise
        }
      })
    ]
  })

  sdk.start()
  console.log(`✅ OpenTelemetry initialized for ${serviceName}`)

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    if (sdk) {
      await sdk.shutdown()
      console.log('OpenTelemetry shut down successfully')
    }
  })
}
```

### Step 5: Bootstrap in main.ts (5 mins)

Update `src/main.ts`:

```typescript
// ADD THIS AT THE VERY TOP - BEFORE ANY OTHER IMPORTS
import { initializeOpenTelemetry } from './instrumentation/otel-init'

// Initialize OpenTelemetry first
initializeOpenTelemetry()

// Now import the rest
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
// ... rest of imports

async function bootstrap() {
  // ... existing code
}

bootstrap()
```

### Step 6: Test It! (5 mins)

```bash
# Start your app
npm run start:dev

# Make a request
curl http://localhost:4040/api/health

# Open Jaeger UI
open http://localhost:16686

# Search for service: kuybi-nest
# You should see traces!
```

---

## Phase 2: Add Custom Traces (15 mins)

### Method 1: Automatic (Recommended)

Already works! Auto-instrumentation traces:
- ✅ HTTP requests
- ✅ Database queries (PostgreSQL)
- ✅ Redis operations
- ✅ Express middleware

### Method 2: Manual Spans (For Custom Logic)

```typescript
// In any service
import { trace } from '@opentelemetry/api'

export class StoryService {
  async processStory(storyId: string) {
    const tracer = trace.getTracer('story-service')
    
    return tracer.startActiveSpan('processStory', async (span) => {
      try {
        span.setAttribute('story.id', storyId)
        
        // Your business logic
        const result = await this.doComplexProcessing(storyId)
        
        span.setStatus({ code: 0 }) // Success
        return result
      } catch (error) {
        span.recordException(error)
        span.setStatus({ code: 2, message: error.message }) // Error
        throw error
      } finally {
        span.end()
      }
    })
  }
}
```

---

## Phase 3: Add Prometheus Metrics (20 mins)

### Step 1: Create Metrics Service

```bash
mkdir -p src/core/observability/metrics
```

Create `src/core/observability/metrics/metrics.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { Counter, Histogram, Gauge, register } from 'prom-client'

@Injectable()
export class MetricsService {
  // HTTP metrics
  readonly httpRequestsTotal: Counter
  readonly httpRequestDuration: Histogram

  constructor() {
    // Initialize metrics
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    })

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
    })
  }

  // Get all metrics
  async getMetrics(): Promise<string> {
    return register.metrics()
  }
}
```

### Step 2: Create Metrics Controller

Create `src/core/observability/metrics/metrics.controller.ts`:

```typescript
import { Controller, Get, Header } from '@nestjs/common'
import { MetricsService } from './metrics.service'

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics()
  }
}
```

### Step 3: Create Metrics Module

Create `src/core/observability/observability.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { MetricsService } from './metrics/metrics.service'
import { MetricsController } from './metrics/metrics.controller'

@Module({
  providers: [MetricsService],
  controllers: [MetricsController],
  exports: [MetricsService]
})
export class ObservabilityModule {}
```

### Step 4: Register Module

Update `src/app.module.ts`:

```typescript
import { ObservabilityModule } from '@core/observability/observability.module'

@Module({
  imports: [
    // ... existing imports
    ObservabilityModule
  ]
})
export class AppModule {}
```

### Step 5: Add Metrics Interceptor

Create `src/core/observability/metrics/metrics.interceptor.ts`:

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { MetricsService } from './metrics.service'

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const response = context.switchToHttp().getResponse()
    const startTime = Date.now()

    return next.handle().pipe(
      tap(() => {
        const duration = (Date.now() - startTime) / 1000
        const labels = {
          method: request.method,
          route: request.route?.path || request.url,
          status_code: response.statusCode.toString()
        }

        this.metricsService.httpRequestsTotal.inc(labels)
        this.metricsService.httpRequestDuration.observe(labels, duration)
      })
    )
  }
}
```

### Step 6: Register Interceptor Globally

Update `src/main.ts`:

```typescript
import { MetricsInterceptor } from '@core/observability/metrics/metrics.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  
  // ... existing setup
  
  // Add metrics interceptor
  const metricsService = app.get(MetricsService)
  app.useGlobalInterceptors(new MetricsInterceptor(metricsService))
  
  await app.listen(4040)
}
```

### Step 7: Test Metrics

```bash
# Make some requests
curl http://localhost:4040/api/health
curl http://localhost:4040/api/stories

# View metrics
curl http://localhost:4040/metrics

# You should see:
# http_requests_total{method="GET",route="/api/health",status_code="200"} 1
# http_request_duration_seconds_bucket{...} ...
```

---

## Phase 4: Visualize with Prometheus + Grafana (Optional)

### Quick Docker Compose

Create `docker-compose.observability.yml`:

```yaml
version: '3.8'

services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI
      - "14268:14268"  # HTTP collector
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    depends_on:
      - prometheus
```

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'kuybi-nest'
    static_configs:
      - targets: ['host.docker.internal:4040']
    metrics_path: '/metrics'
```

Start everything:

```bash
docker-compose -f docker-compose.observability.yml up -d

# Access:
# Jaeger: http://localhost:16686
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3000 (admin/admin)
```

---

## Common Issues & Solutions

### Issue: No traces appearing in Jaeger

**Solution**:
```bash
# Check if Jaeger is running
docker ps | grep jaeger

# Check OTel logs
tail -f logs/server.log | grep -i "otel\|telemetry"

# Verify endpoint is reachable
curl http://localhost:14268/api/traces -X POST -d '{}'
```

### Issue: Metrics endpoint returns empty

**Solution**:
```bash
# Check if metrics module is imported
grep -r "ObservabilityModule" src/app.module.ts

# Check if interceptor is registered
grep -r "MetricsInterceptor" src/main.ts

# Make a request first, then check metrics
curl http://localhost:4040/api/health
curl http://localhost:4040/metrics
```

### Issue: High overhead / slow performance

**Solution**:
```bash
# Reduce sample rate in production
OTEL_TRACING_SAMPLE_RATE=0.1  # Only trace 10%

# Disable auto-instrumentation for certain modules
# In otel-init.ts:
instrumentations: [
  getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-dns': { enabled: false }
  })
]
```

---

## Next Steps

1. ✅ **Add custom business metrics**: Story creation, user signups, etc.
2. ✅ **Create Grafana dashboards**: Import pre-built dashboards
3. ✅ **Setup alerts**: Configure Prometheus alert rules
4. ✅ **Trace correlation**: Link traces with Pino logs
5. ✅ **Production setup**: Deploy Tempo/Prometheus for real monitoring

---

## Useful Commands

```bash
# View Jaeger traces
open http://localhost:16686

# Check metrics
curl http://localhost:4040/metrics

# Query Prometheus
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'

# Restart with OTel disabled
OTEL_ENABLED=false npm run start:dev

# Test trace with specific transaction
curl -H "x-transaction-id: test-123" http://localhost:4040/api/health
```

---

## Resources

- [OpenTelemetry Docs](https://opentelemetry.io/docs/instrumentation/js/)
- [Jaeger UI Guide](https://www.jaegertracing.io/docs/latest/frontend-ui/)
- [Prometheus Queries](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)

---

**Status**: 🚀 Ready to implement  
**Estimated Time**: 30-60 minutes  
**Difficulty**: Medium

---

*For the full implementation plan, see [OPENTELEMETRY_IMPLEMENTATION_PLAN.md](../../planning/OPENTELEMETRY_IMPLEMENTATION_PLAN.md)*
