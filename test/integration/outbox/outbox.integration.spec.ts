/**
 * Transactional outbox: OutboxService records jobs with the caller's transaction and
 * OutboxRelay hands them to BullMQ (real PostgreSQL and Redis).
 */
import { getQueueToken } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ENTITIES } from '@app/database/entities'
import { PrometheusController } from '@willsoto/nestjs-prometheus'
import { Queue } from 'bullmq'
import { LoggerModule } from 'nestjs-pino'
import { DataSource } from 'typeorm'

import {
  OutboxMessage,
  OutboxMetrics,
  OutboxModule,
  OutboxRelay,
  OutboxRelayModule,
  OutboxService
} from '@core/outbox'
import { QueueName } from '@core/queues/jobs/types'

import { testConfig } from '../../test.config'

// A queue no processor listens to in tests, so dispatched jobs stay put
const QUEUE = QueueName.SECURITY_SCAN

describe('Transactional outbox', () => {
  let moduleRef: TestingModule
  let dataSource: DataSource
  let outbox: OutboxService
  let relay: OutboxRelay
  let queue: Queue

  const messages = () => dataSource.getRepository(OutboxMessage)

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [() => testConfig] }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: testConfig.database.host,
          port: testConfig.database.port,
          username: testConfig.database.username,
          password: testConfig.database.password,
          database: testConfig.database.database,
          entities: ENTITIES,
          synchronize: false,
          logging: false
        }),
        OutboxModule,
        OutboxRelayModule
      ]
    }).compile() // not init(): the polling timer stays off, tests drive relayBatch()

    dataSource = moduleRef.get(DataSource)
    outbox = moduleRef.get(OutboxService)
    relay = moduleRef.get(OutboxRelay)
    queue = moduleRef.get<Queue>(getQueueToken(QUEUE))
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM outbox_messages')
    await queue.obliterate({ force: true })
  })

  afterAll(async () => {
    await dataSource.query('DELETE FROM outbox_messages')
    await queue.obliterate({ force: true })
    await queue.close()
    await moduleRef.close()
  })

  const job = (n: number) => ({ queue: QUEUE, name: 'scan', data: { n } })

  it('records nothing when the surrounding transaction rolls back', async () => {
    await expect(
      dataSource.transaction(async manager => {
        await outbox.enqueue(job(1), manager)
        throw new Error('business write failed')
      })
    ).rejects.toThrow('business write failed')

    expect(await messages().count()).toBe(0)
  })

  it('dispatches committed messages to BullMQ with the message id as job id', async () => {
    const id = await dataSource.transaction(manager => outbox.enqueue(job(1), manager))

    expect(await relay.relayBatch()).toBe(1)

    const stored = await messages().findOneByOrFail({ id })
    expect(stored.status).toBe('dispatched')
    expect(stored.dispatchedAt).toBeInstanceOf(Date)
    const queued = await queue.getJob(id)
    expect(queued?.name).toBe('scan')
    expect(queued?.data).toEqual({ n: 1 })
  })

  it('holds delayed messages until they are due', async () => {
    await outbox.enqueue({ ...job(1), delayMs: 60_000 })

    expect(await relay.relayBatch()).toBe(0)
    expect(await queue.count()).toBe(0)
  })

  it('backs off and records the error when dispatch fails', async () => {
    const id = await outbox.enqueue({ ...job(1), queue: 'no-such-queue' as QueueName })

    await relay.relayBatch()

    const stored = await messages().findOneByOrFail({ id })
    expect(stored.status).toBe('pending')
    expect(stored.attempts).toBe(1)
    expect(stored.lastError).toBeTruthy()
    expect(stored.availableAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('does not queue a message twice when it is re-dispatched', async () => {
    const id = await outbox.enqueue(job(1))
    await relay.relayBatch()
    // Simulate a worker that queued the job but died before marking the row
    await messages().update(id, { status: 'pending', dispatchedAt: null })

    await relay.relayBatch()

    expect(await queue.getJobCountByTypes('waiting', 'prioritized', 'delayed')).toBe(1)
  })

  it('never hands the same message to two relays running in parallel', async () => {
    for (let n = 0; n < 30; n++) await outbox.enqueue(job(n))

    const claimed = await Promise.all([relay.relayBatch(), relay.relayBatch(), relay.relayBatch()])

    expect(claimed.reduce((a, b) => a + b, 0)).toBe(30)
    expect(await messages().countBy({ status: 'dispatched' })).toBe(30)
    expect(await queue.getJobCountByTypes('waiting', 'prioritized', 'delayed')).toBe(30)
  })
  describe('metrics', () => {
    // Read what /metrics actually serves (the exporter's own controller), not a registry
    // of our choosing: the gauges once lived in a registry the exporter never read
    const value = async (name: string, status?: string) => {
      const response = { header: () => undefined }
      const text = await new PrometheusController().index(response)
      const label = status ? `{status="${status}"}` : ''
      const line = text.split('\n').find(l => l.startsWith(`${name}${label} `))
      return line === undefined ? undefined : Number(line.split(' ')[1])
    }

    it('reports counts by status and the age of the oldest due message', async () => {
      moduleRef.get(OutboxMetrics).onModuleInit()
      const due = await outbox.enqueue(job(1))
      await outbox.enqueue({ ...job(2), delayMs: 60 * 60 * 1000 }) // delayed: not "stuck"
      const failed = await outbox.enqueue(job(3))
      await dataSource.query(
        `UPDATE outbox_messages SET "createdAt" = now() - interval '10 minutes' WHERE id = $1`,
        [due]
      )
      await messages().update(failed, { status: 'failed' })

      expect(await value('outbox_messages', 'pending')).toBe(2)
      expect(await value('outbox_messages', 'failed')).toBe(1)
      expect(await value('outbox_messages', 'dispatched')).toBe(0)
      const age = await value('outbox_oldest_due_pending_age_seconds')
      expect(age).toBeGreaterThanOrEqual(600)
      expect(age).toBeLessThan(700)
    })

    it('reports zero age when nothing is due', async () => {
      moduleRef.get(OutboxMetrics).onModuleInit()
      await outbox.enqueue({ ...job(1), delayMs: 60 * 60 * 1000 })

      expect(await value('outbox_oldest_due_pending_age_seconds')).toBe(0)
    })
  })
})
