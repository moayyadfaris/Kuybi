import { Module, Global } from '@nestjs/common'
import { MetricsService } from './metrics/metrics.service'
import { PrometheusController } from './metrics/prometheus.controller'

/**
 * Observability Module
 *
 * Provides OpenTelemetry tracing and Prometheus metrics.
 * Global module - MetricsService is available everywhere without imports.
 */
@Global()
@Module({
  providers: [MetricsService],
  controllers: [PrometheusController],
  exports: [MetricsService]
})
export class ObservabilityModule {}
