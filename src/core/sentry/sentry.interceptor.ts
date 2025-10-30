import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable, throwError } from 'rxjs'
import { catchError, tap } from 'rxjs/operators'
import { SentryService } from './sentry.service'
import { Request } from 'express'

interface AuthenticatedRequest extends Request {
  user?: { id?: string; email?: string; username?: string }
}

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  constructor(private readonly sentryService: SentryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = request.user

    // Set user context if available
    if (user?.id) {
      this.sentryService.setUser({
        id: user.id,
        email: user.email,
        username: user.username
      })
    }

    // Add request breadcrumb
    this.sentryService.addBreadcrumb('HTTP Request', 'http', {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent']
    })

    const startTime = Date.now()

    return next.handle().pipe(
      tap(() => {
        // Add success breadcrumb
        const duration = Date.now() - startTime
        this.sentryService.addBreadcrumb('HTTP Response', 'http', {
          method: request.method,
          url: request.url,
          duration,
          status: 'success'
        })
      }),
      catchError((error: Error) => {
        // Add error context
        this.sentryService.setContext('request', {
          method: request.method,
          url: request.url,
          headers: this.sanitizeHeaders(request.headers),
          query: request.query,
          params: request.params
        })

        // Capture exception
        this.sentryService.captureException(error, {
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
