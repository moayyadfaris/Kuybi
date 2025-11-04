import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap, catchError, finalize } from 'rxjs/operators'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import { Request, Response } from 'express'

/**
 * Tracing Interceptor
 *
 * Automatically creates OpenTelemetry spans for all HTTP requests
 * Captures request context, user information, and response details
 */
@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = executionContext.switchToHttp()
    const request = httpContext.getRequest<Request>()
    const response = httpContext.getResponse<Response>()

    const tracer = trace.getTracer('http-server')
    const routePath = this.getRoutePath(executionContext)

    const span = tracer.startSpan('http.request', {
      attributes: {
        'http.method': request.method,
        'http.route': routePath,
        'http.url': request.url,
        'http.target': request.path,
        'http.user_agent': request.get('user-agent') || 'unknown',
        'http.host': request.get('host') || 'unknown',
        'http.scheme': request.protocol,
        'net.peer.ip': this.getClientIp(request)
      }
    })

    // Add user context if authenticated
    const user = (request as any).user
    if (user) {
      span.setAttribute('user.id', user.id || user.userId || 'unknown')
      if (user.email) {
        span.setAttribute('user.email', user.email)
      }
      if (user.role) {
        span.setAttribute('user.role', user.role)
      }
    }

    // Add request ID if available
    const requestId = request.headers['x-request-id'] as string
    if (requestId) {
      span.setAttribute('request.id', requestId)
    }

    const startTime = Date.now()

    return context.with(trace.setSpan(context.active(), span), () =>
      next.handle().pipe(
        tap(() => {
          const duration = Date.now() - startTime
          span.setAttribute('http.status_code', response.statusCode)
          span.setAttribute('http.response_time_ms', duration)

          // Set status based on HTTP status code
          if (response.statusCode >= 400) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${response.statusCode}`
            })
          } else {
            span.setStatus({ code: SpanStatusCode.OK })
          }
        }),
        catchError((error) => {
          const duration = Date.now() - startTime
          span.setAttribute('http.response_time_ms', duration)
          span.setAttribute('http.status_code', error.status || 500)

          span.recordException(error)
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message || 'Internal Server Error'
          })

          throw error
        }),
        finalize(() => {
          span.end()
        })
      )
    )
  }

  /**
   * Extract route pattern from execution context
   */
  private getRoutePath(executionContext: ExecutionContext): string {
    const handler = executionContext.getHandler()
    const controller = executionContext.getClass()

    // Try to get route from metadata
    const request = executionContext.switchToHttp().getRequest()
    const route = request.route?.path

    if (route) {
      // Get controller path prefix if it exists
      const controllerPath = Reflect.getMetadata('path', controller) || ''
      return controllerPath ? `/${controllerPath}${route}` : route
    }

    // Fallback to handler and controller names
    return `${controller.name}.${handler.name}`
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'] as string
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }

    const realIp = request.headers['x-real-ip'] as string
    if (realIp) {
      return realIp
    }

    return request.socket.remoteAddress || 'unknown'
  }
}
