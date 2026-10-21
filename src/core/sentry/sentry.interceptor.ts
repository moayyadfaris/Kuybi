import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { pathOf, redactQuery } from '@shared/utils/redact.util'
import { Request } from 'express'
import { Observable, throwError } from 'rxjs'
import { catchError, tap } from 'rxjs/operators'

import { SentryService } from './sentry.service'

// req.user is typed globally (src/shared/types/express.d.ts)
type AuthenticatedRequest = Request

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  constructor(private readonly sentryService: SentryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = request.user

    // The id only: Sentry is set not to collect personal data
    if (user?.id) {
      this.sentryService.setUser({ id: user.id })
    }
    const url = pathOf(request.originalUrl ?? request.url)

    // Add request breadcrumb
    this.sentryService.addBreadcrumb('HTTP Request', 'http', {
      method: request.method,
      url,
      userAgent: request.headers['user-agent']
    })

    const startTime = Date.now()

    return next.handle().pipe(
      tap(() => {
        // Add success breadcrumb
        const duration = Date.now() - startTime
        this.sentryService.addBreadcrumb('HTTP Response', 'http', {
          method: request.method,
          url,
          duration,
          status: 'success'
        })
      }),
      catchError((error: unknown) => {
        // Context only: HttpExceptionFilter reports 5xx once (it also sees errors thrown by
        // guards, which never reach interceptors). Capturing here sent every 4xx as well.
        this.sentryService.setContext('request', {
          method: request.method,
          url,
          headers: this.sanitizeHeaders(request.headers),
          query: redactQuery(request.query),
          params: request.params,
          route: request.route?.path,
          controller: context.getClass().name,
          handler: context.getHandler().name
        })
        return throwError(() => error)
      })
    )
  }

  private sanitizeHeaders(headers: Request['headers']): Record<string, unknown> {
    const sanitized = { ...headers }
    delete sanitized.authorization
    delete sanitized.cookie
    return sanitized
  }
}
