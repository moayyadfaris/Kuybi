import { getQueueToken } from '@nestjs/bullmq'
import { Injectable, OnModuleInit } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { Gauge, register } from '@prometheus-io/client'
import { Queue } from 'bullmq'

import { QueueName } from './jobs/types'

const QUEUE_JOBS = 'queue_jobs'
const STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const

/** The queues the gauge reads; the latest module's (tests boot several in one process) */
let tracked: Queue[] = []

/**
 * Queue depths on /metrics, read from Redis at scrape time:
 * queue_jobs{queue, state} for every queue and waiting / active / delayed / failed /
 * completed. Dead letters (queue="dead-letter-queue") are jobs that failed every attempt
 * and stay until someone handles them; a growing waiting count elsewhere means the
 * worker is down or behind.
 *
 * Alert rules: docs/observability/alerts/queues.rules.yml
 */
@Injectable()
export class QueueMetrics implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    tracked = Object.values(QueueName)
      .map(name => this.moduleRef.get<Queue>(getQueueToken(name), { strict: false }))
      .filter((queue): queue is Queue => Boolean(queue))

    if (register.getSingleMetric(QUEUE_JOBS)) return
    new Gauge({
      name: QUEUE_JOBS,
      help: 'Jobs per queue and state',
      labelNames: ['queue', 'state'],
      async collect() {
        this.reset()
        await Promise.all(
          tracked.map(async queue => {
            const counts = await queue.getJobCounts(...STATES)
            for (const state of STATES) this.set({ queue: queue.name, state }, counts[state] ?? 0)
          })
        )
      }
    })
  }
}
