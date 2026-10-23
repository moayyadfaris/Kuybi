import { Counter, Histogram, register } from '@prometheus-io/client'
import { getResponseError } from '@shared/http/response-error'
import type { NextFunction, Request, Response } from 'express'

import { routeOf } from '@core/logging/http-log'

const REQUESTS = 'http_requests_total'
const DURATION = 'http_request_duration_seconds'

function requestsCounter(): Counter<string> {
  return (
    (register.getSingleMetric(REQUESTS) as Counter<string> | undefined) ??
    new Counter({
      name: REQUESTS,
      help: 'HTTP requests by method, matched route, status and error code',
      labelNames: ['method', 'route', 'status', 'code']
    })
  )
}

function durationHistogram(): Histogram<string> {
  return (
    (register.getSingleMetric(DURATION) as Histogram<string> | undefined) ??
    new Histogram({
      name: DURATION,
      help: 'HTTP request duration in seconds by method and matched route',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    })
  )
}

/**
 * Counts every request and its duration when the response finishes, labelled with the
 * matched route (/api/v1/stories/:id; "unmatched" for paths no route handles, so a
 * scan of random URLs cannot create unbounded series) and, for errors, the ErrorCode.
 * Error rate per endpoint and per code, and latency, come from these.
 *
 * Alert rules: docs/observability/alerts/http.rules.yml
 */
export function httpMetricsMiddleware() {
  const requests = requestsCounter()
  const duration = durationHistogram()
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint()
    res.once('finish', () => {
      const route = routeOf(req) ?? 'unmatched'
      requests.inc({
        method: req.method,
        route,
        status: String(res.statusCode),
        code: getResponseError(res)?.code ?? ''
      })
      duration.observe(
        { method: req.method, route },
        Number(process.hrtime.bigint() - started) / 1e9
      )
    })
    next()
  }
}
