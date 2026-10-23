import { HttpException, HttpStatus } from '@nestjs/common'

import { codeForStatus, ErrorCode, isErrorCode } from './error-code'
import type { FieldError } from './field-error'

/**
 * Error responses are RFC 9457 problem details (application/problem+json): the standard
 * members (type, title, status, detail, instance) and Kuybi's extensions (code,
 * requestId, timestamp, errors, details). One shape for every error; clients branch on
 * `code` and translate it, and show `detail` only as a fallback.
 */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json'

export interface ProblemDetails {
  /** Identifies the kind of problem; one per code (urn:kuybi:problem:validation-failed) */
  type: string
  /** Short summary of the kind of problem; the same for every occurrence */
  title: string
  status: number
  /** This occurrence, in English. Generic for server errors (outside development) */
  detail: string
  /** The request path (never its query string, which can carry tokens) */
  instance: string
  code: ErrorCode
  /** Quote this when reporting a problem: it finds the request in logs and traces */
  requestId: string
  timestamp: string
  /** Per-field problems (validation, duplicate values) */
  errors?: FieldError[]
  /** Data specific to the code (e.g. details.unlockIn for AUTH_ACCOUNT_LOCKED) */
  details?: unknown
  /** Development only, server errors only */
  stack?: string
  causes?: Array<{ type: string; message: string }>
}

/** One title per code: the compiler fails when a new code has none */
export const PROBLEM_TITLES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'Bad request',
  VALIDATION_FAILED: 'The request has invalid fields',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Not allowed',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict with the current state',
  PAYLOAD_TOO_LARGE: 'Request too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  UNPROCESSABLE_ENTITY: 'Request cannot be processed',
  LOCKED: 'Locked',
  TOO_MANY_REQUESTS: 'Too many requests',
  INTERNAL_ERROR: 'Internal server error',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  AUTH_TOKEN_MISSING: 'Access token missing',
  AUTH_TOKEN_EXPIRED: 'Access token expired',
  AUTH_TOKEN_INVALID: 'Access token invalid',
  AUTH_SESSION_ENDED: 'Session ended',
  AUTH_REFRESH_TOKEN_INVALID: 'Refresh token invalid',
  AUTH_INVALID_CREDENTIALS: 'Invalid email or password',
  AUTH_ACCOUNT_LOCKED: 'Account locked',
  AUTH_ACCOUNT_INACTIVE: 'Account inactive',
  AUTH_PASSWORD_CHANGE_REQUIRED: 'Password change required',
  PASSWORD_CHANGE_COOLDOWN: 'Password changed too recently',
  PASSWORD_TOO_WEAK: 'Password too weak',
  PASSWORD_RECENTLY_USED: 'Password used recently',
  DUPLICATE_VALUE: 'Value already taken',
  IDEMPOTENCY_KEY_INVALID: 'Idempotency key invalid',
  IDEMPOTENCY_KEY_REUSED: 'Idempotency key reused',
  IDEMPOTENCY_IN_PROGRESS: 'Request still in progress',
  VERSION_CONFLICT: 'Changed by someone else'
}

/** urn:kuybi:problem:validation-failed */
export function problemType(code: ErrorCode): string {
  return `urn:kuybi:problem:${code.toLowerCase().replace(/_/g, '-')}`
}

/** Shown for server errors instead of their (internal) message */
const SERVER_ERROR_DETAIL =
  'Something went wrong on our side. If it keeps happening, report it with the requestId.'

export interface ProblemContext {
  instance: string
  requestId: string
  /** Development/test only: server errors keep their message, stack and causes */
  exposeDetails: boolean
}

/** The problem for a thrown value, and the real message for the log */
export function buildProblem(
  exception: unknown,
  context: ProblemContext
): { problem: ProblemDetails; message: string } {
  const status =
    exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
  const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR
  const body = exception instanceof HttpException ? exception.getResponse() : undefined
  const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const message = messageOf(exception, body)
  const code = codeOf(status, fields)

  const problem: ProblemDetails = {
    type: problemType(code),
    title: PROBLEM_TITLES[code],
    status,
    detail: isServerError && !context.exposeDetails ? SERVER_ERROR_DETAIL : message,
    instance: context.instance,
    code,
    requestId: context.requestId,
    timestamp: new Date().toISOString()
  }

  if (isServerError) {
    // A server error's body is internal; only health results (which dependency is down)
    // are for the caller
    const health = fields.details ?? fields.checks
    if (health !== undefined) problem.details = health
    if (context.exposeDetails && exception instanceof Error) {
      problem.stack = exception.stack
      const causes = causesOf(exception)
      if (causes.length > 0) problem.causes = causes
    }
  } else {
    if (isFieldErrorList(fields.errors)) problem.errors = fields.errors
    if (fields.details !== undefined) problem.details = fields.details
  }
  return { problem, message }
}

/** The code a throw site set, if known (4xx only: a 5xx body never decides it) */
function codeOf(status: number, fields: Record<string, unknown>): ErrorCode {
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR) return codeForStatus(status)
  if (isErrorCode(fields.code)) return fields.code
  // A list of messages is how Nest reports validation without our exceptionFactory
  if (status === HttpStatus.BAD_REQUEST && Array.isArray(fields.message)) {
    return ErrorCode.VALIDATION_FAILED
  }
  return codeForStatus(status)
}

function messageOf(exception: unknown, body: unknown): string {
  const message =
    typeof body === 'string'
      ? body
      : ((body as { message?: unknown } | undefined)?.message ??
        (exception instanceof Error ? exception.message : undefined))
  if (Array.isArray(message)) return message.join('; ')
  return typeof message === 'string' && message ? message : 'An error occurred'
}

function isFieldErrorList(value: unknown): value is FieldError[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        item &&
        typeof item === 'object' &&
        typeof (item as FieldError).pointer === 'string' &&
        typeof (item as FieldError).code === 'string' &&
        typeof (item as FieldError).message === 'string'
    )
  )
}

/** The chain of Error.cause, outermost first */
function causesOf(error: Error): Array<{ type: string; message: string }> {
  const causes: Array<{ type: string; message: string }> = []
  let cause: unknown = error.cause
  while (cause instanceof Error && causes.length < 10) {
    causes.push({ type: cause.name, message: cause.message })
    cause = cause.cause
  }
  return causes
}
