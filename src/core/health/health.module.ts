import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

import { CacheService } from '../cache/services/cache.service'

import { HealthController } from './health.controller'

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [CacheService]
})
export class HealthModule {}
