import { Injectable, OnModuleInit } from '@nestjs/common'
import { Gauge, register } from '@prometheus-io/client'
import { DataSource } from 'typeorm'

import { OutboxMessage } from './outbox-message.entity'

const MESSAGES = 'outbox_messages'
const OLDEST_DUE = 'outbox_oldest_due_pending_age_seconds'

/**
 * Outbox health on /metrics, computed from the table at scrape time (the outbox is
 * shared state, so whichever process serves /metrics reports for all of them).
 *
 * - outbox_messages{status}: pending / dispatched / failed counts. Any failed message
 *   is a job that will never run without someone looking at it.
 * - outbox_oldest_due_pending_age_seconds: how long the oldest message that is due
 *   (not delayed) has waited. Growth means the relay is stopped or Redis is down.
 *
 * Registered with @prometheus-io/client, the package @willsoto/nestjs-prometheus serves
 * /metrics from (not its predecessor prom-client, which has a separate registry).
 *
 * Alert rules: docs/observability/alerts/outbox.rules.yml
 */
@Injectable()
export class OutboxMetrics implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    const dataSource = this.dataSource
    // Several test modules may boot in one process; register each gauge once
    if (!register.getSingleMetric(MESSAGES)) {
      new Gauge({
        name: MESSAGES,
        help: 'Outbox messages by status',
        labelNames: ['status'],
        async collect() {
          this.reset()
          const rows: Array<{ status: string; count: string }> = await dataSource
            .getRepository(OutboxMessage)
            .createQueryBuilder('m')
            .select('m.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .groupBy('m.status')
            .getRawMany()
          for (const status of ['pending', 'dispatched', 'failed']) {
            const row = rows.find(r => r.status === status)
            this.set({ status }, Number(row?.count ?? 0))
          }
        }
      })
    }
    if (!register.getSingleMetric(OLDEST_DUE)) {
      new Gauge({
        name: OLDEST_DUE,
        help: 'Age in seconds of the oldest pending outbox message that is due',
        async collect() {
          const [row] = (await dataSource.query(
            `SELECT COALESCE(EXTRACT(EPOCH FROM now() - MIN("createdAt")), 0) AS age
               FROM outbox_messages WHERE status = 'pending' AND "availableAt" <= now()`
          )) as Array<{ age: string | number }>
          this.set(Number(row?.age ?? 0))
        }
      })
    }
  }
}
