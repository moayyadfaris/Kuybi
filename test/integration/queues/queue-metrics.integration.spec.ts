/**
 * Queue depths on /metrics (queue_jobs{queue,state}): failed jobs and dead letters used
 * to pile up unseen, with nothing to alert on.
 */
import { getQueueToken } from '@nestjs/bullmq'
import { ModuleRef } from '@nestjs/core'
import { PrometheusController } from '@willsoto/nestjs-prometheus'
import { Queue } from 'bullmq'

import { QueueName } from '@core/queues/jobs/types'
import { QueueMetrics } from '@core/queues/queue-metrics'

import { testConfig } from '../../test.config'

const connection = {
  host: testConfig.redis.host,
  port: testConfig.redis.port,
  db: testConfig.redis.db
}

describe('Queue metrics', () => {
  // Own prefix: never touches other queues in the (shared) Redis
  const prefix = `kuybi-test-metrics-${process.pid}`
  const queues = new Map(
    Object.values(QueueName).map(name => [name, new Queue(name, { connection, prefix })])
  )
  const moduleRef = {
    get: (token: string) =>
      [...queues.entries()].find(([name]) => getQueueToken(name) === token)?.[1]
  } as unknown as ModuleRef

  const value = async (queue: string, state: string) => {
    const text = await new PrometheusController().index({ header: () => undefined })
    const line = text
      .split('\n')
      .find(l => l.startsWith(`queue_jobs{queue="${queue}",state="${state}"} `))
    return line === undefined ? undefined : Number(line.split(' ')[1])
  }

  afterAll(async () => {
    for (const queue of queues.values()) {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('reports waiting, delayed and dead-lettered jobs per queue', async () => {
    new QueueMetrics(moduleRef).onModuleInit()
    await queues.get(QueueName.DEAD_LETTER)!.add('dead-letter', { originalQueue: 'email' })
    await queues.get(QueueName.EMAIL)!.add('send-welcome', {}, { delay: 60_000 })

    expect(await value(QueueName.DEAD_LETTER, 'waiting')).toBe(1)
    expect(await value(QueueName.EMAIL, 'delayed')).toBe(1)
    expect(await value(QueueName.EMAIL, 'failed')).toBe(0)
  })
})
