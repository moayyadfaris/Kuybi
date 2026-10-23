import type { Response } from 'express'

/**
 * What went wrong with a request, recorded on its response by HttpExceptionFilter so the
 * request log (one line per request, written when the response finishes) can say it.
 */
export interface ResponseErrorInfo {
  /** ErrorCode sent to the client */
  code: string
  /** The real message (for 5xx, the internal one the client does not see) */
  message: string
  /** Sanitized preview of what the client sent, for 5xx and validation failures */
  request?: Record<string, unknown>
}

interface ResponseWithError extends Response {
  /** pino-http logs this error (type, message, stack, causes) with the request */
  err?: Error
}

/**
 * Attaches the error to the response. `error` is passed for server errors only: their
 * stack belongs in the log; a client error's does not.
 */
export function setResponseError(res: Response, info: ResponseErrorInfo, error?: Error): void {
  res.locals.error = info
  if (error) (res as ResponseWithError).err = error
}

export function getResponseError(res: Pick<Response, 'locals'>): ResponseErrorInfo | undefined {
  return res.locals?.error as ResponseErrorInfo | undefined
}
