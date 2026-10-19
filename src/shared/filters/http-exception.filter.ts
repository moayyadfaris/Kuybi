import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { errorProperty } from '@shared/utils/error.util'
import { Request, Response } from 'express'
import { PinoLogger } from 'nestjs-pino'

interface ErrorResponseBody {
  success: false
  statusCode: number
  path: string
  timestamp: string
  requestId: string
  error: {
    message: string
    details?: unknown
    stack?: string
    [key: string]: unknown
  }
}

/** Called once per 5xx (e.g. to report it to Sentry); never for client errors. */
export type ServerErrorReporter = (exception: unknown, request: Request, status: number) => void

/**
 * The single global exception filter: one response shape for every error.
 *
 * Client errors (4xx) return their message and validation details. Server errors (5xx)
 * return a generic message unless `http.exposeErrorDetails` is on (development/test
 * only); the real message and stack always go to the log.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly exposeErrorDetails: boolean
  private readonly safeFields: Set<string>
  private readonly maxFieldLength: number
  private readonly sensitiveKeys = [
    'password',
    'token',
    'secret',
    'authorization',
    'apiKey',
    'credential'
  ]

  constructor(
    @Inject(Logger) private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly reportServerError?: ServerErrorReporter
  ) {
    // Fails closed: missing config means production behaviour
    this.exposeErrorDetails = this.configService.get<boolean>('http.exposeErrorDetails', false)
    const allowedFields =
      this.configService.get<string[]>('logging.payloadPreview.allowedFields', []) ?? []
    this.safeFields = new Set(allowedFields.map(field => field.toLowerCase()))
    this.maxFieldLength = this.configService.get<number>(
      'logging.payloadPreview.maxFieldLength',
      160
    )
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR
    const exposeDetails = this.exposeErrorDetails

    // Extract error details
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null

    const errorMessage =
      exception instanceof HttpException
        ? typeof exceptionResponse === 'string'
          ? exceptionResponse
          : errorProperty<string>(exceptionResponse, 'message') || exception.message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error'

    const errorStack = exception instanceof Error ? exception.stack : undefined

    // Get request ID for correlation
    const requestId = request.id ? String(request.id) : 'unknown'

    const safeBody = this.sanitizePayload(request.body)
    const safeQuery = this.sanitizePayload(request.query, false)
    const safeParams = this.sanitizePayload(request.params, false)

    const logPayload = {
      requestId,
      userId: request.user?.id,
      method: request.method,
      url: request.url,
      statusCode: status,
      errorMessage,
      stack: errorStack,
      body: safeBody,
      query: safeQuery,
      params: safeParams
    }
    const logMessage = `${request.method} ${request.url} failed with ${status}`
    if (isServerError) {
      this.logger.error(logPayload, logMessage)
      this.report(exception, request, status)
    } else {
      // Client errors are expected traffic (bad input, expired tokens); keep them out of error alerts
      this.logger.warn(logPayload, logMessage)
    }

    // Build error response
    const errorResponse: ErrorResponseBody = {
      success: false,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
      error: {
        message: isServerError && !exposeDetails ? this.getSafeErrorMessage(status) : errorMessage
      }
    }

    // Structured bodies: a client error's (validation messages, field errors, lockout
    // details) is built for the client and always passed through. A server error's is
    // passed through only for health checks ('details') or when details are exposed;
    // anything else could carry internals.
    if (exceptionResponse && typeof exceptionResponse === 'object') {
      if (!isServerError || exposeDetails || 'details' in exceptionResponse) {
        Object.assign(errorResponse.error, exceptionResponse)
      }
    }

    if (exposeDetails && errorStack) {
      errorResponse.error.stack = errorStack
    }

    response.status(status).json(errorResponse)
  }

  private report(exception: unknown, request: Request, status: number): void {
    if (!this.reportServerError) return
    try {
      this.reportServerError(exception, request, status)
    } catch (error) {
      // Reporting must never replace the original error response
      this.logger.warn({ error: (error as Error).message }, 'Server error reporter failed')
    }
  }

  private sanitizePayload(payload: unknown, enforceAllowList = true) {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }

    if (Array.isArray(payload)) {
      return `[array:${payload.length}]`
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      const normalizedKey = key.toLowerCase()
      if (this.sensitiveKeys.some(token => normalizedKey.includes(token))) {
        sanitized[key] = '[REDACTED]'
        continue
      }

      if (enforceAllowList && this.safeFields.size > 0 && !this.safeFields.has(normalizedKey)) {
        sanitized[key] = '[FILTERED]'
        continue
      }

      sanitized[key] = this.truncateValue(value)
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined
  }

  private truncateValue(value: unknown) {
    if (value === null || value === undefined) {
      return value
    }

    if (Array.isArray(value)) {
      return `[array:${value.length}]`
    }

    if (typeof value === 'object') {
      return '[object]'
    }

    const text = String(value)
    if (text.length > this.maxFieldLength) {
      return `${text.slice(0, this.maxFieldLength)}…`
    }
    return text
  }

  private getSafeErrorMessage(status: number): string {
    const messages: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable'
    }
    return messages[status] || 'An error occurred'
  }
}
