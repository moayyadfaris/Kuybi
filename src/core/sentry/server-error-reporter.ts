import type { ServerErrorReporter } from '@shared/filters/http-exception.filter'
import { pathOf } from '@shared/utils/redact.util'

import { routeOf } from '@core/logging/http-log'

import { SentryService } from './sentry.service'

/**
 * Reports an API server error (5xx) to Sentry, tagged so it can be found from a support
 * ticket (requestId), grouped by endpoint (route) and filtered by user: the same keys as
 * the request's log line. The path is sent without its query (it can carry tokens).
 */
export function serverErrorReporter(sentry: SentryService): ServerErrorReporter {
  return (exception, request, status) => {
    const tags: Record<string, string> = {
      requestId: String(request.id ?? 'unknown'),
      route: routeOf(request) ?? pathOf(request.originalUrl ?? request.url),
      method: request.method,
      status: String(status)
    }
    if (request.user?.id) tags.userId = request.user.id
    sentry.captureException(exception, { path: pathOf(request.originalUrl ?? request.url) }, tags)
  }
}
