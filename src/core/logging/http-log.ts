import { getResponseError } from '@shared/http/response-error'
import { pathOf } from '@shared/utils/redact.util'
import type { Request, Response } from 'express'

/**
 * How the request log describes a finished request: one line per request, written by
 * pino-http when the response finishes (HttpExceptionFilter only records the error on
 * the response, see setResponseError).
 */

/** Client errors that are someone's attention-worthy event, not routine traffic */
const NOTABLE_CLIENT_ERRORS = new Set([403, 429])

export type HttpLogLevel = 'info' | 'warn' | 'error'

/**
 * - error: server errors (5xx) and requests that failed without an answer
 * - warn: refused access (403), rate limits (429), and requests slower than `slowMs`
 * - info: everything else, including expected client errors (400, 401, 404, 409, 422):
 *   they are normal traffic, and as warnings they drowned out the ones that matter
 */
export function httpLogLevel(
  status: number,
  failed: boolean,
  durationMs: number | undefined,
  slowMs: number
): HttpLogLevel {
  if (failed || status >= 500) return 'error'
  if (NOTABLE_CLIENT_ERRORS.has(status)) return 'warn'
  if (durationMs !== undefined && slowMs > 0 && durationMs >= slowMs) return 'warn'
  return 'info'
}

type LoggedRequest = Request & { receivedAt?: number; sessionId?: string }

/** Milliseconds since the request arrived (RequestIdMiddleware stamps it) */
export function elapsedMs(req: LoggedRequest): number | undefined {
  return req.receivedAt === undefined ? undefined : Date.now() - req.receivedAt
}

/** The matched route (/api/v1/stories/:id): requests group by endpoint, not by id */
export function routeOf(req: Request): string | undefined {
  const route = (req.route as { path?: unknown } | undefined)?.path
  return typeof route === 'string' ? `${req.baseUrl ?? ''}${route}` : undefined
}

/**
 * Fields added to the request's log line; only those that have a value. pino-http also
 * asks when the request starts, before routing: nothing is known then (the route would
 * be the middleware's catch-all and appear twice on the line).
 */
export function httpLogProps(
  req: LoggedRequest,
  res: Response,
  slowMs: number
): Record<string, unknown> {
  if (!res.headersSent) return {}
  const error = getResponseError(res)
  const duration = elapsedMs(req)
  const props: Record<string, unknown> = {
    route: routeOf(req),
    userId: req.user?.id,
    sessionId: req.sessionId,
    errorCode: error?.code,
    errorMessage: error?.message,
    request: error?.request,
    slow: duration !== undefined && slowMs > 0 && duration >= slowMs ? true : undefined
  }
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined))
}

/** "POST /api/v1/auth/login 400 VALIDATION_FAILED" */
export function httpLogMessage(req: Request, res: Response): string {
  const code = getResponseError(res)?.code
  const where = routeOf(req) ?? pathOf(req.originalUrl ?? req.url)
  return [req.method, where, res.statusCode, code].filter(Boolean).join(' ')
}
