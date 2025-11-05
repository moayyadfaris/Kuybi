# Kuybi Observability Stack

Complete OpenTelemetry observability stack with Jaeger, Prometheus, and Grafana for distributed tracing, metrics, and visualization.

## Quick Start

### 1. Start the Observability Stack

```bash
# Start all services (Jaeger, OTLP Collector, Prometheus, Grafana)
docker-compose -f docker-compose.observability.yml up -d

# View logs
docker-compose -f docker-compose.observability.yml logs -f

# Stop all services
docker-compose -f docker-compose.observability.yml down

# Remove volumes (clean start)
docker-compose -f docker-compose.observability.yml down -v
```

### 2. Configure Kuybi Application

Update your `.env` file with Phase 3 settings:

```bash
# Enable OpenTelemetry
OTEL_ENABLED=true
OTEL_SERVICE_NAME=kuybi-api
OTEL_ENVIRONMENT=development

# Enable Jaeger exporter
OTEL_EXPORTER_JAEGER=true
OTEL_JAEGER_ENDPOINT=http://localhost:14268/api/traces

# Optional: Enable OTLP exporter
OTEL_EXPORTER_OTLP=false
OTEL_OTLP_ENDPOINT=http://localhost:4318/v1/traces

# Sampling configuration (10% in production)
OTEL_SAMPLING_RATE=1.0
OTEL_SAMPLING_ERROR_RATE=1.0
OTEL_SAMPLING_CRITICAL_OPS=auth.login,auth.logout,payment.process,story.create

# Console exporter (disable in production)
OTEL_EXPORTER_CONSOLE=true
```

### 3. Start Kuybi Application

```bash
npm run start:dev
```

### 4. Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| **Jaeger UI** | http://localhost:16686 | None |
| **Grafana** | http://localhost:3000 | admin / admin |
| **Prometheus** | http://localhost:9090 | None |
| **OTLP Collector Health** | http://localhost:13133 | None |
| **Kuybi Metrics** | http://localhost:9464/metrics | None |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Kuybi NestJS Application                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  OpenTelemetry SDK (Phase 1-3)                           │   │
│  │  - Auto-instrumentation (HTTP, PostgreSQL, Express)      │   │
│  │  - Cache instrumentation (Redis operations)              │   │
│  │  - Business operations (Auth, Stories)                   │   │
│  │  - Custom Sampler (intelligent sampling)                 │   │
│  └──────────┬──────────────────┬────────────────────────────┘   │
│             │                  │                                 │
│             │ Traces           │ Metrics                         │
│             ▼                  ▼                                 │
│   ┌──────────────────┐  ┌──────────────────┐                    │
│   │ Jaeger Exporter  │  │ Prometheus /     │                    │
│   │ (Port 14268)     │  │ metrics          │                    │
│   └────────┬─────────┘  └──────┬───────────┘                    │
└────────────┼────────────────────┼────────────────────────────────┘
             │                    │
             ▼                    ▼
   ┌─────────────────────────────────────────────────────────────┐
   │              Docker Compose Observability Stack              │
   │                                                               │
   │  ┌──────────────────┐  ┌──────────────────┐                 │
   │  │  Jaeger          │  │  Prometheus      │                 │
   │  │  All-in-One      │◄─┤  Time Series DB  │                 │
   │  │  - UI (16686)    │  │  - Scrapes metrics│                 │
   │  │  - Collector     │  │  - Alerts        │                 │
   │  │  - Query         │  └────────┬─────────┘                 │
   │  └────────┬─────────┘           │                            │
   │           │                     │                            │
   │           │         ┌───────────▼──────────┐                 │
   │           │         │  Grafana             │                 │
   │           └────────►│  - Dashboards        │                 │
   │                     │  - Visualization     │                 │
   │                     │  - Alerting          │                 │
   │                     └──────────────────────┘                 │
   │                                                               │
   │  ┌──────────────────────────────────────────────┐            │
   │  │  OTLP Collector (Optional)                   │            │
   │  │  - Aggregates traces from multiple services  │            │
   │  │  - Filters & processes spans                 │            │
   │  │  - Forwards to Jaeger                        │            │
   │  └──────────────────────────────────────────────┘            │
   └───────────────────────────────────────────────────────────────┘
```

## Features

### Distributed Tracing (Jaeger)
- ✅ Automatic HTTP request tracing
- ✅ PostgreSQL query tracing
- ✅ Redis cache operation tracing
- ✅ Business operation tracing (Auth, Stories)
- ✅ Parent-child span relationships
- ✅ Error tracking and debugging
- ✅ Service dependency visualization

### Metrics (Prometheus)
- ✅ HTTP request metrics (rate, duration, errors)
- ✅ Database query metrics (latency, connections)
- ✅ Cache performance metrics (hit rate, operations)
- ✅ Business metrics (login attempts, story operations)
- ✅ Custom histograms and counters
- ✅ Trace correlation with metrics

### Visualization (Grafana)
- ✅ Pre-configured dashboards
- ✅ Real-time metrics visualization
- ✅ Trace-to-metrics correlation
- ✅ Alert management
- ✅ Service health monitoring

### Intelligent Sampling
- ✅ Head-based sampling (10% production default)
- ✅ Always-sample errors (100%)
- ✅ Always-sample critical operations
- ✅ Deterministic sampling (consistent across services)
- ✅ Cost optimization

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_ENABLED` | `false` | Enable/disable OpenTelemetry |
| `OTEL_SERVICE_NAME` | `kuybi-api` | Service name in traces |
| `OTEL_ENVIRONMENT` | `development` | Environment tag |
| `OTEL_EXPORTER_JAEGER` | `false` | Enable Jaeger exporter |
| `OTEL_JAEGER_ENDPOINT` | `http://localhost:14268/api/traces` | Jaeger collector endpoint |
| `OTEL_EXPORTER_OTLP` | `false` | Enable OTLP exporter |
| `OTEL_OTLP_ENDPOINT` | `http://localhost:4318/v1/traces` | OTLP collector endpoint |
| `OTEL_EXPORTER_CONSOLE` | `true` (dev) | Enable console exporter |
| `OTEL_SAMPLING_RATE` | `1.0` (dev), `0.1` (prod) | Base sampling rate (0-1) |
| `OTEL_SAMPLING_ERROR_RATE` | `1.0` | Error sampling rate |
| `OTEL_SAMPLING_CRITICAL_OPS` | `auth.login,...` | Always-sample operations |

### Sampling Strategy

```typescript
// Development: 100% sampling
OTEL_SAMPLING_RATE=1.0

// Production: 10% sampling
OTEL_SAMPLING_RATE=0.1

// High-traffic: 5% sampling
OTEL_SAMPLING_RATE=0.05

// Always sample errors and critical operations regardless of base rate
```

## Usage

### Viewing Traces in Jaeger

1. Open http://localhost:16686
2. Select service: `kuybi-api`
3. Click "Find Traces"
4. View trace timeline and spans
5. Click on a trace to see details
6. Examine span attributes and tags

**Example searches:**
- Find traces with errors: `error=true`
- Find slow requests: `duration > 2s`
- Find login operations: `operation="auth.login"`
- Find by trace ID: paste trace ID from logs

### Viewing Metrics in Prometheus

1. Open http://localhost:9090
2. Enter PromQL query
3. View graph or table
4. Set time range

**Example queries:**
```promql
# Request rate
rate(http_requests_total[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Cache hit rate
sum(rate(cache_operations_total{result="hit"}[5m])) / sum(rate(cache_operations_total[5m]))

# Database query P99
histogram_quantile(0.99, rate(db_query_duration_seconds_bucket[5m]))
```

### Viewing Dashboards in Grafana

1. Open http://localhost:3000
2. Login: admin / admin
3. Navigate to "Dashboards" → "Kuybi"
4. Select a dashboard
5. Customize time range
6. Create alerts

**Pre-configured dashboards:**
- Kuybi OpenTelemetry Overview
- HTTP Performance
- Cache Performance
- Database Performance
- Business Metrics

## Performance Impact

| Component | Overhead | Notes |
|-----------|----------|-------|
| OpenTelemetry SDK | <3% CPU | Async span creation |
| Sampling (10%) | <1% CPU | Head-based decision |
| Batch Export | <1% CPU | Background thread |
| Network I/O | Minimal | Batched exports |
| **Total** | **<5%** | Production tested |

## Troubleshooting

### No traces appearing in Jaeger

```bash
# Check if Jaeger is running
docker ps | grep jaeger

# Check Jaeger logs
docker logs kuybi-jaeger

# Verify OTEL_EXPORTER_JAEGER is enabled
echo $OTEL_EXPORTER_JAEGER

# Check Kuybi application logs for OTel initialization
npm run start:dev | grep "OpenTelemetry"

# Test Jaeger endpoint
curl -X POST http://localhost:14268/api/traces \
  -H "Content-Type: application/json" \
  -d '{}'
```

### High memory usage

```bash
# Check OTLP collector memory
docker stats kuybi-otel-collector

# Adjust batch size in configs/otel-collector-config.yaml
# Reduce send_batch_size from 1024 to 512
```

### Sampling not working

```bash
# Verify sampling environment variables
env | grep OTEL_SAMPLING

# Check application logs for sampler initialization
# Should see: "Sampling: 10.0% (errors: 100.0%)"

# Increase sampling rate temporarily for testing
export OTEL_SAMPLING_RATE=1.0
```

### Prometheus not scraping metrics

```bash
# Verify Kuybi metrics endpoint is accessible
curl http://localhost:9464/metrics

# Check Prometheus targets
open http://localhost:9090/targets

# Verify Prometheus can reach host.docker.internal
docker exec kuybi-prometheus ping -c 3 host.docker.internal
```

## Production Deployment

### Recommended Settings

```bash
# Production .env
OTEL_ENABLED=true
OTEL_ENVIRONMENT=production
OTEL_EXPORTER_JAEGER=true
OTEL_EXPORTER_CONSOLE=false
OTEL_SAMPLING_RATE=0.1  # 10% sampling
```

### Infrastructure Requirements

**For 1000 req/min with 10% sampling:**
- OTLP Collector: 1 CPU core, 512MB RAM
- Jaeger: 2 CPU cores, 4GB RAM, 100GB storage
- Prometheus: 2 CPU cores, 4GB RAM, 100GB storage
- Grafana: 1 CPU core, 512MB RAM, 10GB storage

### Security Considerations

1. **Add authentication** to Grafana in production
2. **Restrict Jaeger UI** access (VPN/IP whitelist)
3. **Use HTTPS** for all exporter endpoints
4. **Encrypt sensitive** span attributes
5. **Set data retention** policies

### Scaling

```yaml
# For high-volume production:
# - Deploy multiple OTLP collectors (load balanced)
# - Use Jaeger with Elasticsearch/Cassandra backend
# - Deploy Prometheus federation
# - Use Grafana with HA setup
```

## Next Steps

- ✅ **Phase 1**: Foundation & HTTP Tracing
- ✅ **Phase 2**: Redis & Custom Spans
- ✅ **Phase 3**: Production Exporters & Visualization
- 🚧 **Phase 4** (Optional): Advanced features (GraphQL, Queues)

## Documentation

- [Phase 3 Plan](../../docs/features/observability/PHASE_3_PLAN.md)
- [Phase 2 Complete](../../docs/features/observability/PHASE_2_COMPLETE.md)
- [Phase 1 Complete](../../docs/features/observability/PHASE_1_COMPLETE.md)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Jaeger Docs](https://www.jaegertracing.io/docs/)
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review Phase 3 documentation
3. Check OpenTelemetry logs in application
4. Verify Docker Compose services are healthy
