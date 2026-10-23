import { BadRequestException } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

import { BaseProcessor } from '@core/queues/processors/base.processor'
import { SentryService, serverErrorReporter } from '@core/sentry'

describe('error reporting', () => {
  const sentry = { captureException: jest.fn() } as unknown as SentryService & {
    captureException: jest.Mock
  }
  beforeEach(() => jest.clearAllMocks())

  describe('API server errors', () => {
    it('are tagged with the request id, route, method, status and user, never the query', () => {
      const boom = new Error('db down')
      serverErrorReporter(sentry)(
        boom,
        {
          id: 'req-9',
          method: 'GET',
          url: '/api/v1/stories/42?token=SECRET',
          originalUrl: '/api/v1/stories/42?token=SECRET',
          baseUrl: '',
          route: { path: '/api/v1/stories/:id' },
          user: { id: 'u-1' }
        } as never,
        500
      )

      const [error, context, tags] = sentry.captureException.mock.calls[0]
      expect(error).toBe(boom)
      expect(tags).toEqual({
        requestId: 'req-9',
        route: '/api/v1/stories/:id',
        method: 'GET',
        status: '500',
        userId: 'u-1'
      })
      expect(context).toEqual({ path: '/api/v1/stories/42' })
      expect(JSON.stringify(sentry.captureException.mock.calls)).not.toContain('SECRET')
    })
  })

  describe('worker jobs', () => {
    class TestProcessor extends BaseProcessor {
      constructor() {
        super(
          { warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as PinoLogger,
          { add: jest.fn() } as unknown as Queue
        )
        this.sentry = sentry
      }
      async process(): Promise<void> {}
    }
    const job = (attemptsMade: number) =>
      ({
        id: '7',
        name: 'send-welcome',
        queueName: 'email-queue',
        attemptsMade,
        opts: { attempts: 3 },
        data: {}
      }) as unknown as Job

    it('report a job that failed its last attempt, tagged with queue and job', async () => {
      const error = new Error('smtp down')
      await new TestProcessor().onFailed(job(3), error)

      expect(sentry.captureException).toHaveBeenCalledWith(
        error,
        { jobId: '7', attemptsMade: 3, attemptsAllowed: 3 },
        { queue: 'email-queue', job: 'send-welcome' }
      )
    })

    it('do not report an attempt that will be retried', async () => {
      await new TestProcessor().onFailed(job(1), new BadRequestException('x'))
      expect(sentry.captureException).not.toHaveBeenCalled()
    })
  })
})
