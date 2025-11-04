import { Injectable } from '@nestjs/common'
import { Counter, Histogram, Gauge, Registry, register } from 'prom-client'

/**
 * Metrics Service for collecting and exposing Prometheus metrics
 *
 * Provides type-safe methods for recording business and technical metrics.
 */
@Injectable()
export class MetricsService {
  private readonly registry: Registry

  // HTTP Metrics
  private readonly httpRequestsTotal: Counter
  private readonly httpRequestDuration: Histogram

  // Database Metrics
  private readonly dbQueryDuration: Histogram
  private readonly dbConnectionsActive: Gauge

  // Cache Metrics
  private readonly cacheHits: Counter
  private readonly cacheMisses: Counter
  private readonly cacheOperationDuration: Histogram

  // Business Metrics
  private readonly storiesCreated: Counter
  private readonly userLogins: Counter
  private readonly fileUploads: Counter

  constructor() {
    this.registry = register

    // Initialize HTTP metrics
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry]
    })

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry]
    })

    // Initialize database metrics
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry]
    })

    this.dbConnectionsActive = new Gauge({
      name: 'db_connections_active',
      help: 'Number of active database connections',
      registers: [this.registry]
    })

    // Initialize cache metrics
    this.cacheHits = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_key_prefix'],
      registers: [this.registry]
    })

    this.cacheMisses = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_key_prefix'],
      registers: [this.registry]
    })

    this.cacheOperationDuration = new Histogram({
      name: 'cache_operation_duration_seconds',
      help: 'Cache operation duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
      registers: [this.registry]
    })

    // Initialize business metrics
    this.storiesCreated = new Counter({
      name: 'stories_created_total',
      help: 'Total number of stories created',
      labelNames: ['category'],
      registers: [this.registry]
    })

    this.userLogins = new Counter({
      name: 'user_logins_total',
      help: 'Total number of user logins',
      labelNames: ['success'],
      registers: [this.registry]
    })

    this.fileUploads = new Counter({
      name: 'file_uploads_total',
      help: 'Total number of file uploads',
      labelNames: ['status'],
      registers: [this.registry]
    })
  }

  /**
   * Get Prometheus metrics in text format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics()
  }

  /**
   * Get metrics registry (for testing)
   */
  getRegistry(): Registry {
    return this.registry
  }

  // HTTP Metrics Methods
  recordHttpRequest(method: string, route: string, statusCode: number, durationSeconds: number) {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode })
    this.httpRequestDuration.observe({ method, route, status_code: statusCode }, durationSeconds)
  }

  // Database Metrics Methods
  recordDbQuery(operation: string, table: string, durationSeconds: number) {
    this.dbQueryDuration.observe({ operation, table }, durationSeconds)
  }

  setDbConnectionsActive(count: number) {
    this.dbConnectionsActive.set(count)
  }

  // Cache Metrics Methods
  recordCacheHit(keyPrefix: string) {
    this.cacheHits.inc({ cache_key_prefix: keyPrefix })
  }

  recordCacheMiss(keyPrefix: string) {
    this.cacheMisses.inc({ cache_key_prefix: keyPrefix })
  }

  recordCacheOperation(operation: string, durationSeconds: number) {
    this.cacheOperationDuration.observe({ operation }, durationSeconds)
  }

  // Business Metrics Methods
  recordStoryCreated(category?: string) {
    this.storiesCreated.inc({ category: category || 'unknown' })
  }

  recordUserLogin(success: boolean) {
    this.userLogins.inc({ success: success.toString() })
  }

  recordFileUpload(status: 'success' | 'failure') {
    this.fileUploads.inc({ status })
  }
}
