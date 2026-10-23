import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Inject,
  Logger,
  LoggerService
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { buildProblem, ErrorCode, PROBLEM_CONTENT_TYPE } from '@shared/errors'
import { setResponseError } from '@shared/http/response-error'
import { pathOf } from '@shared/utils/redact.util'
import { Request, Response } from 'express'

/** Called once per 5xx (e.g. to report it to Sentry); never for client errors. */
export type ServerErrorReporter = (exception: unknown, request: Request, status: number) => void

/** Body keys never shown in a log preview, whatever the allow-list says */
const SENSITIVE_KEYS = ['password', 'token', 'secret', 'authorization', 'apikey', 'credential']

/**
 * The single global exception filter: every error becomes an RFC 9457 problem
 * (application/problem+json, see shared/errors/problem.ts).
 *
 * Client errors (4xx) carry their message, field errors and details. Server errors
 * (5xx) carry a generic message unless `http.exposeErrorDetails` is on (development and
 * test only); the real message and the error itself go to the request's log line.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly exposeErrorDetails: boolean
  private readonly safeFields: Set<string>
  private readonly maxFieldLength: number

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

    const { problem, message } = buildProblem(exception, {
      // The path only: the query string can carry tokens
      instance: pathOf(request.originalUrl ?? request.url),
      requestId: request.id ? String(request.id) : 'unknown',
      exposeDetails: this.exposeErrorDetails
    })
    const isServerError = problem.status >= HttpStatus.INTERNAL_SERVER_ERROR

    // Logged once, on the request's own log line when the response finishes (see
    // core/logging/http-log.ts): the code, the real message, what the client sent for
    // server errors and validation failures, and a server error itself (stack, causes)
    setResponseError(
      response,
      {
        code: problem.code,
        message,
        request:
          isServerError || problem.code === ErrorCode.VALIDATION_FAILED
            ? this.requestPreview(request)
            : undefined
      },
      isServerError ? asError(exception) : undefined
    )
    if (isServerError) this.report(exception, request, problem.status)

    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem)
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
      if (SENSITIVE_KEYS.some(token => normalizedKey.includes(token))) {
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
    if (value === null || value === undefined) return value
    if (Array.isArray(value)) return `[array:${value.length}]`
    if (typeof value === 'object') return '[object]'
    const text = String(value)
    return text.length > this.maxFieldLength ? `${text.slice(0, this.maxFieldLength)}…` : text
  }
}

/** A thrown value as an Error, so the log can serialize it (anything can be thrown) */
function asError(exception: unknown): Error {
  return exception instanceof Error ? exception : new Error(String(exception))
}
