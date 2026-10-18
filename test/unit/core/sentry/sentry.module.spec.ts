import { SentryModule } from '@core/sentry'
import { SentryTestController } from '@core/sentry/sentry-test.controller'

describe('SentryModule.forRoot', () => {
  const original = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = original
  })

  it.each(['production', 'staging', 'test', undefined])(
    'does not expose the unauthenticated test endpoints when NODE_ENV=%s',
    env => {
      if (env === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = env

      expect(SentryModule.forRoot().controllers).toEqual([])
    }
  )

  it('exposes them in local development', () => {
    process.env.NODE_ENV = 'development'

    expect(SentryModule.forRoot().controllers).toEqual([SentryTestController])
  })
})
