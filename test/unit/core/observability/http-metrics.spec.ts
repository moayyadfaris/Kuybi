import { register } from '@prometheus-io/client'
import { setResponseError } from '@shared/http/response-error'
import { EventEmitter } from 'events'
import type { Request, Response } from 'express'

import { httpMetricsMiddleware } from '@core/observability/http-metrics'

describe('HTTP metrics', () => {
  const middleware = httpMetricsMiddleware()

  const serve = (req: Partial<Request>, status: number, code?: string) => {
    const res = Object.assign(new EventEmitter(), { statusCode: status, locals: {} })
    middleware(req as Request, res as unknown as Response, () => undefined)
    if (code) setResponseError(res as unknown as Response, { code, message: 'x' })
    res.emit('finish')
  }
  const count = async (labels: string) => {
    const text = await register.metrics()
    const line = text.split('\n').find(l => l.startsWith(`http_requests_total{${labels}}`))
    return line ? Number(line.split(' ').at(-1)) : 0
  }

  it('counts by method, matched route, status and error code', async () => {
    const story = { method: 'GET', baseUrl: '', route: { path: '/api/v1/stories/:id' } }
    serve(story, 200)
    serve(story, 404, 'NOT_FOUND')
    serve(story, 404, 'NOT_FOUND')

    expect(await count('method="GET",route="/api/v1/stories/:id",status="200",code=""')).toBe(1)
    expect(
      await count('method="GET",route="/api/v1/stories/:id",status="404",code="NOT_FOUND"')
    ).toBe(2)
  })

  it('puts every path no route handles under one label', async () => {
    serve({ method: 'GET', url: '/random/1' }, 404, 'NOT_FOUND')
    serve({ method: 'GET', url: '/random/2' }, 404, 'NOT_FOUND')

    expect(await count('method="GET",route="unmatched",status="404",code="NOT_FOUND"')).toBe(2)
  })
})
