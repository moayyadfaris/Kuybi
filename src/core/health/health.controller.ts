import { Controller, Get } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator
} from '@nestjs/terminus'

import { CacheService } from '../cache/services/cache.service'

import { S3HealthIndicator } from './indicators/s3.health'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private s3: S3HealthIndicator,
    private cacheService: CacheService,
    private configService: ConfigService
  ) {}

  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Comprehensive health check status' })
  async check() {
    const healthIndicators: Array<() => Promise<any>> = [
      // Database connectivity
      () => this.db.pingCheck('database'),

      // Redis connectivity
      async () => {
        const isHealthy = await this.cacheService.isHealthy()
        return {
          redis: {
            status: isHealthy ? 'up' : 'down'
          }
        }
      },

      // Memory usage (heap should not exceed 300MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),

      // Memory RSS should not exceed 500MB
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),

      // Disk storage (95% threshold)
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.95 })
    ]

    // Only add S3 check if configured (has AWS credentials)
    const hasAwsCredentials = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE
    if (hasAwsCredentials) {
      healthIndicators.push(() => this.s3.isHealthy('s3'))
    }

    const result = await this.health.check(healthIndicators)

    // Return cleaner response: only status and details (details contains all checks)
    // 'info' contains only healthy checks, 'error' contains only unhealthy checks
    // For monitoring tools that need the distinction, 'details' has everything
    return {
      status: result.status,
      checks: result.details
    }
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Readiness check' })
  async ready() {
    const dbHealthy = await this.db.pingCheck('database')
    const cacheHealthy = await this.cacheService.isHealthy()

    const status = dbHealthy && cacheHealthy ? 'ready' : 'not ready'

    return {
      status,
      checks: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: cacheHealthy ? 'healthy' : 'unhealthy'
      },
      timestamp: new Date().toISOString()
    }
  }

  @Get('live')
  @ApiOkResponse({ description: 'Liveness check' })
  live() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString()
    }
  }
}
