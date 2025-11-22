import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { Response } from 'express'

import { SentryService } from './sentry.service'

@Catch()
export class SentryFilter implements ExceptionFilter {
  constructor(private readonly sentryService: SentryService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    const message = exception instanceof HttpException ? exception.message : 'Internal server error'

    // Only capture 500+ errors to Sentry (server errors, not client errors)
    if (status >= 500) {
      this.sentryService.setContext('error', {
        message,
        statusCode: status,
        path: request.url,
        method: request.method
      })

      this.sentryService.captureException(
        exception instanceof Error ? exception : new Error(String(exception))
      )
    }

    // Return error response
    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url
    })
  }
}
