import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health.controller'
import { CacheService } from '../cache/services/cache.service'

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [CacheService],
})
export class HealthModule {}
