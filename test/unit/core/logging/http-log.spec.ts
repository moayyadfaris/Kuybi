import { setResponseError } from '@shared/http/response-error'
import type { Request, Response } from 'express'

import { httpLogLevel, httpLogMessage, httpLogProps, routeOf } from '@core/logging/http-log'

describe('request log line', () => {
  const request = (fields: Partial<Request> & { receivedAt?: number; sessionId?: string } = {}) =>
    ({
      method: 'GET',
      url: '/api/v1/stories/42?token=secret',
      originalUrl: '/api/v1/stories/42?token=secret',
      baseUrl: '',
      ...fields
    }) as unknown as Request
  const response = (statusCode = 200) =>
    ({ statusCode, locals: {}, headersSent: true }) as unknown as Response

  describe('level', () => {
    it.each([
      [200, 'info'],
      [400, 'info'],
      [401, 'info'],
      [404, 'info'],
      [409, 'info'],
      [422, 'info'],
      [403, 'warn'],
      [429, 'warn'],
      [500, 'error'],
      [503, 'error']
    ])('%i is %s', (status, level) => {
      expect(httpLogLevel(status, false, 10, 1000)).toBe(level)
    })

    it('raises a slow request to warn, and a failed one to error', () => {
      expect(httpLogLevel(200, false, 1500, 1000)).toBe('warn')
      expect(httpLogLevel(200, true, 10, 1000)).toBe('error')
    })
  })

  it('names the matched route, not the concrete path', () => {
    expect(routeOf(request({ route: { path: '/api/v1/stories/:id' } } as never))).toBe(
      '/api/v1/stories/:id'
    )
    expect(routeOf(request())).toBeUndefined()
  })

  it('says what failed: route, user, session, code and the real message', () => {
    const req = request({
      route: { path: '/api/v1/stories/:id' },
      user: { id: 'u-1' },
      sessionId: 's-1',
      receivedAt: Date.now() - 5
    } as never)
    const res = response(404)
    setResponseError(res, { code: 'NOT_FOUND', message: 'Story with ID 42 not found' })

    expect(httpLogProps(req, res, 1000)).toEqual({
      route: '/api/v1/stories/:id',
      userId: 'u-1',
      sessionId: 's-1',
      errorCode: 'NOT_FOUND',
      errorMessage: 'Story with ID 42 not found'
    })
    expect(httpLogMessage(req, res)).toBe('GET /api/v1/stories/:id 404 NOT_FOUND')
  })

  it('never puts the query string in the message', () => {
    expect(httpLogMessage(request(), response(200))).toBe('GET /api/v1/stories/42 200')
  })

  it('adds nothing before the response is sent (pino-http also asks at the start)', () => {
    const res = { statusCode: 200, locals: {}, headersSent: false } as unknown as Response
    expect(httpLogProps(request({ route: { path: '/x' } } as never), res, 1000)).toEqual({})
  })

  it('flags a slow request', () => {
    const props = httpLogProps(request({ receivedAt: Date.now() - 2000 }), response(200), 1000)
    expect(props).toEqual({ slow: true })
  })

  it('records the server error itself for the log, not a client error', () => {
    const res = response(500) as Response & { err?: Error }
    const boom = new Error('db down')
    setResponseError(res, { code: 'INTERNAL_ERROR', message: 'db down' }, boom)
    expect(res.err).toBe(boom)

    const clientRes = response(400) as Response & { err?: Error }
    setResponseError(clientRes, { code: 'BAD_REQUEST', message: 'bad' })
    expect(clientRes.err).toBeUndefined()
  })
})
