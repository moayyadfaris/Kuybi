import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'

import { QueuesModule } from '../queues/queues.module'

import { S3HealthIndicator } from './indicators/s3.health'
import { HealthController } from './health.controller'

/** /health, /health/ready and /health/live (CacheService comes from the global cache module) */
@Module({
  imports: [TerminusModule, ConfigModule, QueuesModule],
  controllers: [HealthController],
  providers: [S3HealthIndicator]
})
export class HealthModule {}
