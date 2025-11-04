import { Controller, Get, Header } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { MetricsService } from './metrics.service'

/**
 * Prometheus Metrics Controller
 *
 * Exposes /metrics endpoint for Prometheus scraping
 */
@ApiTags('Observability')
@Controller()
export class PrometheusController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiResponse({
    status: 200,
    description: 'Prometheus metrics in text format',
    type: String
  })
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics()
  }
}
