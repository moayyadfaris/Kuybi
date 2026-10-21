/**
 * Worker lifecycle on real BullMQ: BaseProcessor's handlers must be wired to the worker's
 * events, and a job that fails its last attempt must land in the dead-letter queue exactly
 * once (earlier attempts are retried, not dead-lettered).
 */
import { BullModule, getQueueToken, InjectQueue, Processor } from '@nestjs/bullmq'
import { Test, TestingModule } from '@nestjs/testing'
import { Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

import { QueueName } from '@core/queues/jobs/types'
import { BaseProcessor } from '@core/queues/processors/base.processor'

import { testConfig } from '../../test.config'

const WORK_QUEUE = 'dead-letter-test-work'
const silent = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }

@Processor(WORK_QUEUE)
class AlwaysFailingProcessor extends BaseProcessor {
  constructor(@InjectQueue(QueueName.DEAD_LETTER) deadLetterQueue: Queue) {
    super(silent as unknown as PinoLogger, deadLetterQueue)
  }

  async process(): Promise<never> {
    throw new Error('boom')
  }
}

describe('Dead-letter queue (real BullMQ)', () => {
  // Own prefix: never touches other queues in the (shared) Redis
  const prefix = `kuybi-test-dlq-${process.pid}`
  let moduleRef: TestingModule
  let work: Queue
  let deadLetter: Queue

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({ connection: testConfig.redis, prefix }),
        BullModule.registerQueue({ name: WORK_QUEUE }, { name: QueueName.DEAD_LETTER })
      ],
      providers: [AlwaysFailingProcessor]
    }).compile()
    await moduleRef.init()
    work = moduleRef.get(getQueueToken(WORK_QUEUE))
    deadLetter = moduleRef.get(getQueueToken(QueueName.DEAD_LETTER))
  })

  afterAll(async () => {
    await work.obliterate({ force: true })
    await deadLetter.obliterate({ force: true })
    await moduleRef.close()
  })

  it('dead-letters a job once, after its last attempt', async () => {
    await work.add('flaky', { id: 42 }, { attempts: 2, backoff: { type: 'fixed', delay: 50 } })

    const deadline = Date.now() + 10_000
    while ((await deadLetter.count()) === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await new Promise(resolve => setTimeout(resolve, 500)) // room for a duplicate to appear

    const entries = await deadLetter.getJobs(['waiting', 'delayed', 'prioritized'])
    expect(entries).toHaveLength(1)
    expect(entries[0].data).toMatchObject({
      originalQueue: WORK_QUEUE,
      jobName: 'flaky',
      data: { id: 42 },
      attemptsAllowed: 2,
      attemptsMade: 2,
      failedReason: 'boom'
    })
  })
})
