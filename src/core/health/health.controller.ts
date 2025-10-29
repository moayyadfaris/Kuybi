import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOkResponse } from '@nestjs/swagger'
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus'
import { CacheService } from '../cache/services/cache.service'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private cacheService: CacheService
  ) {}

  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Health check status' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      async () => {
        const isHealthy = await this.cacheService.isHealthy()
        return {
          redis: {
            status: isHealthy ? 'up' : 'down'
          }
        }
      }
    ])
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
