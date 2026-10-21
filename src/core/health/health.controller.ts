import { InjectQueue } from '@nestjs/bullmq'
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger'
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  HealthIndicatorFunction,
  HealthIndicatorService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator
} from '@nestjs/terminus'
import { Queue } from 'bullmq'

import { CacheService } from '../cache/services/cache.service'
import { QueueName } from '../queues/jobs/types'

import { S3HealthIndicator } from './indicators/s3.health'

/**
 * Probes. They answer 503 when unhealthy: load balancers and Kubernetes read the HTTP
 * status, not the body.
 * - /health/live: the process runs (restart it otherwise)
 * - /health/ready: it can serve requests: database and cache answer (take it out of
 *   rotation otherwise)
 * - /health: everything, for monitoring: also the queue Redis, memory, disk, S3
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly s3: S3HealthIndicator,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    @InjectQueue(QueueName.DEAD_LETTER) private readonly queue: Queue
  ) {}

  @Get()
  @HealthCheck()
  @ApiOkResponse({ description: 'Every dependency is healthy' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is unhealthy' })
  async check() {
    const checks: HealthIndicatorFunction[] = [
      () => this.db.pingCheck('database'),
      () => this.redis(),
      () => this.queueRedis(),
      // Heap 300 MB, RSS 500 MB (PM2 restarts the API at 500 MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
      () => this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.95 })
    ]
    // S3 credentials may come from the AWS chain (IAM role): check whenever a bucket is set
    if (this.configService.get<string>('s3.bucket')) checks.push(() => this.s3.isHealthy('s3'))

    const result = await this.health.check(checks)
    return { status: result.status, checks: result.details }
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Ready: the database and the cache answer' })
  @ApiServiceUnavailableResponse({ description: 'Not ready' })
  async ready() {
    const [database, redis] = await Promise.all([
      this.db.pingCheck('database').then(
        () => true,
        () => false
      ),
      this.cacheService.isHealthy().catch(() => false)
    ])
    const body = {
      status: database && redis ? 'ready' : 'not ready',
      checks: {
        database: database ? 'healthy' : 'unhealthy',
        redis: redis ? 'healthy' : 'unhealthy'
      },
      timestamp: new Date().toISOString()
    }
    if (!database || !redis) throw new ServiceUnavailableException(body)
    return body
  }

  @Get('live')
  @ApiOkResponse({ description: 'Liveness check' })
  live() {
    return { status: 'alive', timestamp: new Date().toISOString() }
  }

  private async redis() {
    const indicator = this.indicators.check('redis')
    return (await this.cacheService.isHealthy().catch(() => false))
      ? indicator.up()
      : indicator.down()
  }

  /** The Redis database the queues use (REDIS_QUEUE_DB), apart from the cache's */
  private async queueRedis() {
    const indicator = this.indicators.check('queue_redis')
    try {
      // Any round trip to the queue database will do
      await this.queue.getJobCounts('waiting')
      return indicator.up()
    } catch (error) {
      return indicator.down({ error: (error as Error).message })
    }
  }
}
