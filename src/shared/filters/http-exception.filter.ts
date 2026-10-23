import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  LoggerService
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { codeForStatus, ErrorCode, isErrorCode } from '@shared/errors'
import { setResponseError } from '@shared/http/response-error'
import { errorProperty } from '@shared/utils/error.util'
import { pathOf } from '@shared/utils/redact.util'
import { Request, Response } from 'express'

interface ErrorResponseBody {
  success: false
  statusCode: number
  path: string
  timestamp: string
  requestId: string
  error: {
    /** Stable, machine-readable (see ErrorCode); clients branch on this, not the message */
    code: ErrorCode
    message: string
    details?: unknown
    stack?: string
    [key: string]: unknown
  }
}

/**
 * Fields of a 5xx body clients may see: the health and readiness checks' results
 * (terminus: status/info/error/details; /health/ready: status/checks)
 */
const PUBLIC_SERVER_ERROR_FIELDS = ['status', 'info', 'error', 'details', 'checks'] as const

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
    // nestjs-pino's Logger: Nest's signature (message, context), not pino's (object, message)
    @Inject(Logger) private readonly logger: LoggerService,
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

    // The path only: the query string can carry tokens
    const path = pathOf(request.originalUrl ?? request.url)

    // Logged once, on the request's own log line when the response finishes (see
    // core/logging/http-log.ts): the code, the real message, what the client sent for
    // server errors and validation failures, and a server error itself (stack, causes)
    const code = this.errorCode(status, exceptionResponse)
    setResponseError(
      response,
      {
        code,
        message: Array.isArray(errorMessage) ? errorMessage.join('; ') : String(errorMessage),
        request:
          isServerError || code === ErrorCode.VALIDATION_FAILED
            ? this.requestPreview(request)
            : undefined
      },
      isServerError ? asError(exception) : undefined
    )
    if (isServerError) this.report(exception, request, status)

    // Build error response
    const errorResponse: ErrorResponseBody = {
      success: false,
      statusCode: status,
      path,
      timestamp: new Date().toISOString(),
      requestId,
      error: {
        code: this.errorCode(status, exceptionResponse),
        message: isServerError && !exposeDetails ? this.getSafeErrorMessage(status) : errorMessage
      }
    }

    // Structured bodies: a client error's (validation messages, field errors, lockout
    // details) is built for the client and always passed through. A server error's could
    // carry internals: only the public health-check fields pass (never its message), unless
    // details are exposed.
    if (exceptionResponse && typeof exceptionResponse === 'object') {
      if (!isServerError || exposeDetails) {
        Object.assign(errorResponse.error, exceptionResponse)
      } else {
        for (const field of PUBLIC_SERVER_ERROR_FIELDS) {
          if (field in exceptionResponse) {
            errorResponse.error[field] = (exceptionResponse as Record<string, unknown>)[field]
          }
        }
      }
    }

    // The body may carry its own `code`; only a known one survives (set again after the merge)
    errorResponse.error.code = this.errorCode(status, exceptionResponse)

    if (exposeDetails && errorStack) {
      errorResponse.error.stack = errorStack
    }

    response.status(status).json(errorResponse)
  }

  /**
   * The code a throw site set, if it is a known one (4xx only: a 5xx body never decides
   * what the client sees); validation failures; otherwise the status's generic code
   */
  private errorCode(status: number, body: unknown): ErrorCode {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return codeForStatus(status)
    const code = errorProperty<unknown>(body, 'code')
    if (isErrorCode(code)) return code
    // ValidationPipe reports its problems as a list of messages
    if (status === HttpStatus.BAD_REQUEST && Array.isArray(errorProperty(body, 'message'))) {
      return ErrorCode.VALIDATION_FAILED
    }
    return codeForStatus(status)
  }

  private report(exception: unknown, request: Request, status: number): void {
    if (!this.reportServerError) return
    try {
      this.reportServerError(exception, request, status)
    } catch (error) {
      // Reporting must never replace the original error response
      this.logger.warn(`Server error reporter failed: ${(error as Error).message}`)
    }
  }

  /** The sanitized body, query and params, or undefined when all are empty */
  private requestPreview(request: Request): Record<string, unknown> | undefined {
    const preview = {
      body: this.sanitizePayload(request.body),
      query: this.sanitizePayload(request.query, false),
      params: this.sanitizePayload(request.params, false)
    }
    const present = Object.entries(preview).filter(([, value]) => value !== undefined)
    return present.length > 0 ? Object.fromEntries(present) : undefined
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

/** A thrown value as an Error, so the log can serialize it (anything can be thrown) */
function asError(exception: unknown): Error {
  return exception instanceof Error ? exception : new Error(String(exception))
}
