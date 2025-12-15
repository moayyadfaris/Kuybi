import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'

import { CacheService } from '../cache/services/cache.service'

import { S3HealthIndicator } from './indicators/s3.health'
import { HealthController } from './health.controller'

@Module({
  imports: [TerminusModule, ConfigModule],
  controllers: [HealthController],
  providers: [CacheService, S3HealthIndicator]
})
export class HealthModule {}
