import * as Sentry from '@sentry/node'
import { PinoLogger } from 'nestjs-pino'

import { SentryService } from '@core/sentry/sentry.service'

jest.mock('@sentry/node', () => {
  const actual = jest.requireActual('@sentry/node')
  return { ...actual, init: jest.fn() }
})
jest.mock('@sentry/profiling-node', () => ({ nodeProfilingIntegration: jest.fn(() => ({})) }))

const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }

const start = () =>
  new SentryService(
    {
      enabled: true,
      dsn: 'https://public@example.ingest.sentry.io/1',
      environment: 'test',
      release: 'test',
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.2,
      debug: false
    },
    logger as unknown as PinoLogger
  )

describe('SentryService.init options', () => {
  beforeEach(() => jest.mocked(Sentry.init).mockClear())

  // Sentry v11 collects request/response bodies, cookies, user info, DB queries and queue
  // payloads unless told otherwise; here bodies carry passwords, tokens and reset links
  it('keeps personal data collection off', () => {
    start()
    const options = jest.mocked(Sentry.init).mock.calls[0][0]!

    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      queues: false
    })
    expect(JSON.stringify(options.dataCollection)).toContain('authorization')
  })

  it('maps the profiling rate to v11 session profiling', () => {
    start()
    const options = jest.mocked(Sentry.init).mock.calls[0][0]!

    expect(options).toMatchObject({ profileSessionSampleRate: 0.2, profileLifecycle: 'trace' })
  })
})
