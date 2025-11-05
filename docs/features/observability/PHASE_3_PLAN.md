# Phase 3: Production Exporters & Visualization

**Status**: 🚧 In Progress  
**Timeline**: 2-3 days  
**Dependencies**: Phase 1 ✅ Complete, Phase 2 ✅ Complete

## Overview

Phase 3 focuses on production-ready trace exporters, visualization dashboards, and intelligent sampling strategies. This phase transforms our local development tracing into a production observability platform.

### Objectives

1. **Production Exporters**
   - Configure Jaeger for distributed trace visualization
   - Set up OTLP (OpenTelemetry Protocol) collector
   - Implement batch export with error handling
   - Add environment-based exporter selection

2. **Intelligent Sampling**
   - Implement head-based sampling (10-20% production rate)
   - Always-sample error traces
   - Custom business rules sampling (critical operations)
   - Performance vs. cost optimization

3. **Grafana Dashboards**
   - Trace overview dashboard
   - Service dependency map
   - Latency distribution heatmaps
   - Cache performance visualization
   - Error rate tracking

4. **Production Deployment**
   - Docker Compose for local Jaeger/OTLP stack
   - Environment configuration guide
   - Performance benchmarking
   - Alerting rules setup

## Architecture

### Trace Export Flow

```
┌─────────────────┐
│   NestJS App    │
│  (Kuybi API)    │
└────────┬────────┘
         │ Spans
         ▼
┌─────────────────────────────────────┐
│   OpenTelemetry SDK                 │
│  ┌──────────────┐  ┌─────────────┐ │
│  │   Sampler    │  │  Processors │ │
│  │ (Head-based) │→ │  (Batch)    │ │
│  └──────────────┘  └──────┬──────┘ │
└────────────────────────────┼────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────┐ ┌────────────────┐ ┌──────────────┐
│ Console Exporter│ │ Jaeger Exporter│ │ OTLP Exporter│
│   (Dev only)    │ │ (14268/14250)  │ │   (4318)     │
└─────────────────┘ └────────┬───────┘ └──────┬───────┘
                             │                 │
                             ▼                 ▼
                    ┌────────────────┐ ┌──────────────┐
                    │  Jaeger UI     │ │ OTLP Collector│
                    │ (localhost:16686)│ │  (Aggregator)│
                    └────────────────┘ └──────┬───────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │ Backend Storage  │
                                    │ (Tempo/Loki/etc) │
                                    └──────────────────┘
```

### Sampling Strategy

```typescript
// Head-Based Sampling Decision Tree
┌─────────────────┐
│  New Request    │
└────────┬────────┘
         │
         ▼
  ┌──────────────┐
  │ Is Error?    │──Yes──> ALWAYS SAMPLE
  └──────┬───────┘
         │ No
         ▼
  ┌──────────────┐
  │ Critical Op? │──Yes──> ALWAYS SAMPLE
  │ (auth, pay)  │
  └──────┬───────┘
         │ No
         ▼
  ┌──────────────┐
  │ Random(0-1)  │
  │  < ratio?    │──Yes──> SAMPLE (10-20%)
  └──────┬───────┘
         │ No
         ▼
     DROP TRACE
```

## Implementation Plan

### 1. Jaeger Exporter Setup

**File**: `src/core/observability/tracing/tracing.service.ts`

**Changes**:
```typescript
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

private initializeExporters(): void {
  const config = this.configService.get('observability');
  const exporters = [];

  // Console exporter (development)
  if (config.telemetry.exporters.console) {
    exporters.push(new ConsoleSpanExporter());
  }

  // Jaeger exporter (production)
  if (config.telemetry.exporters.jaeger.enabled) {
    const jaegerExporter = new JaegerExporter({
      endpoint: config.telemetry.exporters.jaeger.endpoint,
      serviceName: config.serviceName,
      tags: [
        { key: 'deployment.environment', value: config.environment }
      ]
    });
    
    // Use BatchSpanProcessor for production efficiency
    this.tracerProvider.addSpanProcessor(
      new BatchSpanProcessor(jaegerExporter, {
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
      })
    );
  }

  // OTLP exporter (cloud-native)
  if (config.telemetry.exporters.otlp.enabled) {
    const otlpExporter = new OTLPTraceExporter({
      url: config.telemetry.exporters.otlp.endpoint,
      headers: config.telemetry.exporters.otlp.headers,
    });
    
    this.tracerProvider.addSpanProcessor(
      new BatchSpanProcessor(otlpExporter)
    );
  }
}
```

**Configuration** (`src/config/configuration.ts`):
```typescript
observability: {
  telemetry: {
    exporters: {
      jaeger: {
        enabled: env.JAEGER_ENABLED === 'true',
        endpoint: env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
        agentHost: env.JAEGER_AGENT_HOST || 'localhost',
        agentPort: parseInt(env.JAEGER_AGENT_PORT, 10) || 6831,
      },
      otlp: {
        enabled: env.OTLP_ENABLED === 'true',
        endpoint: env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
        headers: env.OTLP_HEADERS ? JSON.parse(env.OTLP_HEADERS) : {},
      }
    }
  }
}
```

### 2. Intelligent Sampling

**File**: `src/core/observability/samplers/custom.sampler.ts` (NEW)

```typescript
import { Sampler, SamplingDecision, SamplingResult } from '@opentelemetry/sdk-trace-base';
import { Context, SpanKind } from '@opentelemetry/api';

export class CustomSampler implements Sampler {
  constructor(
    private readonly baseSampleRate: number = 0.1, // 10% default
    private readonly errorSampleRate: number = 1.0,  // 100% errors
    private readonly criticalOperations: Set<string> = new Set([
      'auth.login',
      'auth.logout',
      'payment.process',
      'story.create',
    ])
  ) {}

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: any,
    links: any[]
  ): SamplingResult {
    // Always sample errors
    if (attributes['error'] || attributes['http.status_code'] >= 500) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample critical operations
    if (this.criticalOperations.has(spanName)) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Head-based sampling for others
    const shouldSample = this.deterministicSample(traceId, this.baseSampleRate);
    return {
      decision: shouldSample 
        ? SamplingDecision.RECORD_AND_SAMPLED 
        : SamplingDecision.NOT_RECORD
    };
  }

  private deterministicSample(traceId: string, rate: number): boolean {
    // Use trace ID for consistent sampling decision across services
    const hash = parseInt(traceId.substring(0, 8), 16);
    return (hash % 100) < (rate * 100);
  }

  toString(): string {
    return `CustomSampler{base=${this.baseSampleRate}, error=${this.errorSampleRate}}`;
  }
}
```

**Integration**:
```typescript
// In TracingService.initializeTracing()
const sampler = new CustomSampler(
  parseFloat(config.telemetry.sampling.rate),
  1.0, // Always sample errors
  new Set(config.telemetry.sampling.criticalOperations)
);

this.tracerProvider = new NodeTracerProvider({
  resource,
  sampler,
});
```

### 3. Docker Compose Stack

**File**: `docker-compose.observability.yml` (NEW)

```yaml
version: '3.8'

services:
  # Jaeger All-in-One
  jaeger:
    image: jaegertracing/all-in-one:1.54
    container_name: kuybi-jaeger
    ports:
      - "16686:16686"  # Jaeger UI
      - "14268:14268"  # HTTP collector
      - "14250:14250"  # gRPC collector
      - "6831:6831/udp" # Agent (compact thrift)
    environment:
      - COLLECTOR_OTLP_ENABLED=true
      - COLLECTOR_ZIPKIN_HOST_PORT=:9411
    networks:
      - kuybi-observability

  # OpenTelemetry Collector
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.94.0
    container_name: kuybi-otel-collector
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./configs/otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8888:8888"   # Prometheus metrics
      - "13133:13133" # Health check
    depends_on:
      - jaeger
    networks:
      - kuybi-observability

  # Grafana
  grafana:
    image: grafana/grafana:10.3.0
    container_name: kuybi-grafana
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - ./configs/grafana/provisioning:/etc/grafana/provisioning
      - ./configs/grafana/dashboards:/var/lib/grafana/dashboards
      - grafana-storage:/var/lib/grafana
    networks:
      - kuybi-observability

networks:
  kuybi-observability:
    driver: bridge

volumes:
  grafana-storage:
```

### 4. OTLP Collector Configuration

**File**: `configs/otel-collector-config.yaml` (NEW)

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
    send_batch_max_size: 2048

  # Add resource attributes
  resource:
    attributes:
      - key: deployment.environment
        value: development
        action: upsert

  # Memory limiter to prevent OOM
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

exporters:
  # Export to Jaeger
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true

  # Export to Prometheus (for metrics correlation)
  prometheus:
    endpoint: "0.0.0.0:8889"
    const_labels:
      service: kuybi-api

  # Logging exporter for debugging
  logging:
    loglevel: debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, resource]
      exporters: [jaeger, logging]
    
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

### 5. Grafana Dashboard

**File**: `configs/grafana/dashboards/opentelemetry-overview.json` (NEW)

```json
{
  "dashboard": {
    "title": "Kuybi OpenTelemetry Overview",
    "tags": ["opentelemetry", "traces", "kuybi"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Request Rate (traces/sec)",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "P95 Latency by Operation",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "{{operation}}"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])",
            "legendFormat": "{{route}} - {{status}}"
          }
        ]
      },
      {
        "title": "Cache Hit Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(cache_operations_total{result=\"hit\"}[5m])) / sum(rate(cache_operations_total[5m])) * 100"
          }
        ]
      },
      {
        "title": "Database Query Duration (P50, P95, P99)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(db_query_duration_seconds_bucket[5m]))",
            "legendFormat": "P50"
          },
          {
            "expr": "histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))",
            "legendFormat": "P95"
          },
          {
            "expr": "histogram_quantile(0.99, rate(db_query_duration_seconds_bucket[5m]))",
            "legendFormat": "P99"
          }
        ]
      },
      {
        "title": "Active Traces",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(opentelemetry_active_spans)"
          }
        ]
      }
    ]
  }
}
```

### 6. Prometheus Alerting Rules

**File**: `configs/prometheus/alerts.yml` (NEW)

```yaml
groups:
  - name: opentelemetry_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} for {{ $labels.route }}"

      # High latency
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High P95 latency detected"
          description: "P95 latency is {{ $value }}s for {{ $labels.operation }}"

      # Cache performance degradation
      - alert: LowCacheHitRate
        expr: |
          sum(rate(cache_operations_total{result="hit"}[10m])) / 
          sum(rate(cache_operations_total[10m])) < 0.5
        for: 10m
        labels:
          severity: info
        annotations:
          summary: "Cache hit rate below 50%"
          description: "Cache hit rate is {{ $value | humanizePercentage }}"

      # Trace export failures
      - alert: TraceExportFailures
        expr: |
          rate(opentelemetry_exporter_failed_spans[5m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Trace export failures detected"
          description: "{{ $value }} spans failed to export per second"
```

## Environment Variables

**File**: `.env.example` updates

```bash
# OpenTelemetry Exporters
JAEGER_ENABLED=true
JAEGER_ENDPOINT=http://localhost:14268/api/traces
JAEGER_AGENT_HOST=localhost
JAEGER_AGENT_PORT=6831

OTLP_ENABLED=false
OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTLP_HEADERS={}

# Sampling Configuration
TELEMETRY_SAMPLING_RATE=0.1  # 10% in production
TELEMETRY_SAMPLING_CRITICAL_OPS=auth.login,auth.logout,payment.process
```

## Testing Strategy

### Local Testing

1. **Start Observability Stack**:
```bash
docker-compose -f docker-compose.observability.yml up -d
```

2. **Verify Services**:
```bash
# Jaeger UI
open http://localhost:16686

# Grafana
open http://localhost:3000

# OTLP Collector Health
curl http://localhost:13133/health
```

3. **Generate Test Traffic**:
```bash
# Run test script
./test/scripts/generate-trace-traffic.sh
```

4. **Verify Traces in Jaeger**:
- Search for service: `kuybi-api`
- Find traces with multiple spans
- Verify parent-child relationships
- Check span attributes and tags

### Production Validation

1. **Enable sampling in staging**
2. **Monitor export success rate**
3. **Validate dashboard accuracy**
4. **Test alert rules**
5. **Benchmark performance impact**

## Performance Considerations

### Batch Export Tuning

```typescript
new BatchSpanProcessor(exporter, {
  maxQueueSize: 2048,        // Adjust based on throughput
  maxExportBatchSize: 512,   // Balance network vs. latency
  scheduledDelayMillis: 5000, // Export every 5 seconds
  exportTimeoutMillis: 30000, // 30s timeout
})
```

### Sampling Impact

| Sampling Rate | Trace Volume | Storage Cost | Completeness |
|---------------|--------------|--------------|--------------|
| 1% | Very Low | Minimal | Poor |
| 10% | Low | Low | Good |
| 20% | Medium | Medium | Very Good |
| 50% | High | High | Excellent |
| 100% | Very High | Very High | Complete |

**Recommendation**: Start with 10%, increase to 20% for critical services.

### Resource Requirements

**OTLP Collector**:
- CPU: 0.5-1 core
- Memory: 512MB-1GB
- Network: ~10-50 MB/day (10% sampling)

**Jaeger**:
- CPU: 1-2 cores
- Memory: 2-4GB
- Storage: ~100GB/month (depends on retention)

## Success Criteria

- ✅ Jaeger UI showing distributed traces
- ✅ Grafana dashboards displaying metrics
- ✅ <5% total performance overhead
- ✅ Sampling working correctly (10-20% rate)
- ✅ Alerts triggering on test failures
- ✅ Documentation complete

## Timeline

| Task | Duration | Status |
|------|----------|--------|
| Jaeger exporter setup | 4 hours | 🚧 Pending |
| Sampling implementation | 3 hours | 🚧 Pending |
| Docker Compose stack | 2 hours | 🚧 Pending |
| Grafana dashboards | 4 hours | 🚧 Pending |
| OTLP collector config | 2 hours | 🚧 Pending |
| Testing & validation | 3 hours | 🚧 Pending |
| Documentation | 2 hours | 🚧 Pending |
| **Total** | **~2-3 days** | |

## Next Steps

After Phase 3 completion:
- **Phase 4 (Optional)**: Advanced features (GraphQL tracing, Queue instrumentation)
- **Production Deployment**: Roll out to staging, then production
- **Continuous Improvement**: Tune sampling, optimize dashboards, add custom metrics

## References

- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [OTLP Protocol](https://opentelemetry.io/docs/specs/otlp/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
