/**
 * What Sentry receives about a request: no email (Sentry is set not to collect personal
 * data) and no token or secret from the query string.
 */
import { ExecutionContext } from '@nestjs/common'
import { lastValueFrom, throwError } from 'rxjs'

import { SentryInterceptor } from '@core/sentry/sentry.interceptor'
import { SentryService } from '@core/sentry/sentry.service'

describe('SentryInterceptor', () => {
  it('sends neither the email nor query secrets', async () => {
    const sentry = { setUser: jest.fn(), addBreadcrumb: jest.fn(), setContext: jest.fn() }
    const request = {
      method: 'GET',
      url: '/api/v1/x?token=abc123',
      originalUrl: '/api/v1/x?token=abc123',
      path: '/api/v1/x',
      query: { token: 'abc123' },
      params: {},
      headers: { authorization: 'Bearer t', 'user-agent': 'ua' },
      user: { id: 'u1', email: 'someone@private.test' }
    }
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => class Controller {},
      getHandler: () => function handler() {}
    } as unknown as ExecutionContext

    await expect(
      lastValueFrom(
        new SentryInterceptor(sentry as unknown as SentryService).intercept(context, {
          handle: () => throwError(() => new Error('boom'))
        })
      )
    ).rejects.toThrow('boom')

    const sent = JSON.stringify([
      sentry.setUser.mock.calls,
      sentry.addBreadcrumb.mock.calls,
      sentry.setContext.mock.calls
    ])
    expect(sent).not.toContain('someone@private.test')
    expect(sent).not.toContain('abc123')
    expect(sent).not.toContain('Bearer t')
    expect(sentry.setUser).toHaveBeenCalledWith({ id: 'u1' })
  })
})
