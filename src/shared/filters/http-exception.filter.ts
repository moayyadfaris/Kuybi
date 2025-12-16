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
import { Request, Response } from 'express'
import { PinoLogger } from 'nestjs-pino'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
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
    private readonly configService: ConfigService
  ) {
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

    const isDevelopment = process.env.NODE_ENV !== 'production'

    // Extract error details
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null

    const errorMessage =
      exception instanceof HttpException
        ? typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any)?.message || exception.message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error'

    const errorStack = exception instanceof Error ? exception.stack : undefined

    // Get request ID for correlation
    const requestId = (request as any).id || 'unknown'

    const safeBody = this.sanitizePayload(request.body)
    const safeQuery = this.sanitizePayload(request.query, false)
    const safeParams = this.sanitizePayload(request.params, false)

    this.logger.error(
      {
        requestId,
        userId: (request as any).user?.id,
        method: request.method,
        url: request.url,
        statusCode: status,
        errorMessage,
        stack: errorStack,
        body: safeBody,
        query: safeQuery,
        params: safeParams
      },
      `${request.method} ${request.url} failed with ${status}`
    )

    // Build error response
    const errorResponse: any = {
      success: false,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
      error: {
        message: isDevelopment ? errorMessage : this.getSafeErrorMessage(status)
      }
    }

    // Add validation errors or Health Check details if present
    if (exceptionResponse && typeof exceptionResponse === 'object') {
      if ('details' in exceptionResponse || 'error' in exceptionResponse) {
        // Pass through Health Check details or other structured errors
        Object.assign(errorResponse.error, exceptionResponse)
      } else if (
        (exceptionResponse as any).message &&
        Array.isArray((exceptionResponse as any).message)
      ) {
        errorResponse.error.details = (exceptionResponse as any).message
      }
    }

    // Include stack trace in development mode only
    if (isDevelopment && errorStack) {
      errorResponse.error.stack = errorStack
    }

    response.status(status).json(errorResponse)
  }

  private sanitizePayload(payload: any, enforceAllowList = true) {
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

  private truncateValue(value: any) {
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
