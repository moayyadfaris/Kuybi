import { Module } from '@nestjs/common'
import { makeCounterProvider, PrometheusModule } from '@willsoto/nestjs-prometheus'

import { MetricsService } from './metrics.service'

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true
      }
    })
  ],
  providers: [
    MetricsService,
    makeCounterProvider({
      name: 'stories_created_total',
      help: 'Total number of stories created',
      labelNames: ['type', 'status'] // e.g. type=text, status=draft
    }),
    makeCounterProvider({
      name: 'user_logins_total',
      help: 'Total number of user logins',
      labelNames: ['role']
    }),
    makeCounterProvider({
      name: 'auth_failed_logins_total',
      help: 'Failed login attempts by reason',
      labelNames: ['reason'] // user_not_found | invalid_password | account_locked | user_inactive
    })
  ],
  exports: [MetricsService]
})
export class MetricsModule {}
