import { Module } from '@nestjs/common'

import { MetricsModule } from './metrics.module'
import { TracingModule } from './tracing.module'

@Module({
  imports: [TracingModule, MetricsModule],
  exports: [TracingModule, MetricsModule]
})
export class ObservabilityModule {}
