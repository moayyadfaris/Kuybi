import { Injectable } from '@nestjs/common'
import { InjectMetric } from '@willsoto/nestjs-prometheus'
import { Counter } from 'prom-client'

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('stories_created_total') public storiesCreated: Counter<string>,
    @InjectMetric('user_logins_total') public userLogins: Counter<string>
  ) {}

  incrementStoryCreated(type: string, status: string) {
    try {
      this.storiesCreated.labels(type, status).inc()
    } catch (error) {
      // Silently fail or log error to avoid breaking business logic
    }
  }

  incrementUserLogin(role: string) {
    try {
      this.userLogins.labels(role).inc()
    } catch (error) {
      // Silently fail or log error to avoid breaking business logic
    }
  }
}
