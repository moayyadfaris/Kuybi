import { HttpStatus } from '@nestjs/common'

/**
 * Stable, machine-readable error codes: `error.code` in every error response.
 *
 * Clients branch on the code, never on the message (messages are for people and may
 * change). Codes are part of the API: add new ones freely, never rename or reuse one.
 * Throw sites that need a specific code pass it in the exception body:
 *
 *   throw new UnauthorizedException({ code: ErrorCode.AUTH_TOKEN_EXPIRED, message: '...' })
 *
 * Anything else gets the generic code of its HTTP status (codeForStatus).
 */
export const ErrorCode = {
  // Generic, derived from the HTTP status
  BAD_REQUEST: 'BAD_REQUEST',
  /** Request body, query or params failed validation; `error.message` lists the problems */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  LOCKED: 'LOCKED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Authentication: what the client should do next
  /** No bearer token: sign in */
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  /** Access token expired: refresh it */
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  /** Malformed or forged token: sign in again */
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  /** Signed out, revoked or replaced session: sign in again (refreshing will not help) */
  AUTH_SESSION_ENDED: 'AUTH_SESSION_ENDED',
  /** The refresh token is unknown, malformed or expired: sign in again */
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',
  /** Wrong email or password (deliberately not saying which) */
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  /** Too many failed sign-ins; `error.details.unlockIn` says when to retry */
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_ACCOUNT_INACTIVE: 'AUTH_ACCOUNT_INACTIVE',
  /** Only the password-change endpoints accept this token: change the password first */
  AUTH_PASSWORD_CHANGE_REQUIRED: 'AUTH_PASSWORD_CHANGE_REQUIRED',
  /** The password was changed recently; `error.details` says when it can change again */
  PASSWORD_CHANGE_COOLDOWN: 'PASSWORD_CHANGE_COOLDOWN',

  // Idempotency-Key
  IDEMPOTENCY_KEY_INVALID: 'IDEMPOTENCY_KEY_INVALID',
  /** The key was used before with a different request */
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  /** The first request with this key has not finished: retry later */
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',

  /** The record changed since the version the client sent (or during the request): reload it */
  VERSION_CONFLICT: 'VERSION_CONFLICT'
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

const KNOWN_CODES = new Set<string>(Object.values(ErrorCode))

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value)
}

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE_ENTITY,
  [HttpStatus.LOCKED]: ErrorCode.LOCKED,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE
}

/** The generic code of an HTTP status */
export function codeForStatus(status: number): ErrorCode {
  if (status >= 500) {
    return status === HttpStatus.SERVICE_UNAVAILABLE
      ? ErrorCode.SERVICE_UNAVAILABLE
      : ErrorCode.INTERNAL_ERROR
  }
  return STATUS_CODES[status] ?? ErrorCode.BAD_REQUEST
}
