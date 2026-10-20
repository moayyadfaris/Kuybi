import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException
} from '@nestjs/common'
import { ErrorCode } from '@shared/errors'
import { createHash } from 'crypto'
import { Request, Response } from 'express'
import { from, Observable, of, throwError } from 'rxjs'
import { catchError, finalize, mergeMap } from 'rxjs/operators'

import { IDEMPOTENCY_HEARTBEAT_MS, IdempotencyService } from './idempotency.service'

export const IDEMPOTENCY_HEADER = 'idempotency-key'
/** Value of @nestjs/common's HTTP_CODE_METADATA (not exported from the package root) */
const HTTP_CODE_METADATA = '__httpCode__'
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/

type UploadedFiles = {
  file?: { buffer?: Buffer }
  files?: Array<{ buffer?: Buffer }> | Record<string, Array<{ buffer?: Buffer }>>
}

/**
 * Makes a mutating route safe to retry. With an Idempotency-Key header, the first
 * request runs and its outcome (2xx or 4xx) is stored; a retry with the same key and
 * the same body gets that outcome again (header Idempotent-Replayed: true) instead of
 * running twice. A different body with the key is 422, a retry while the first is
 * still running is 409, and a 5xx releases the key so the retry runs. Without the
 * header the route behaves normally.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name)

  constructor(private readonly idempotency: IdempotencyService) {}

  /**
   * Keeps the key's lock fresh while the handler runs, in this process: if the process
   * dies the beats stop and a retry can take the key over after the lease. Stops by
   * itself once the attempt no longer holds the key.
   */
  private startHeartbeat(id: string, lockId: string): NodeJS.Timeout {
    const timer = setInterval(() => {
      this.idempotency.renew(id, lockId).then(
        held => {
          if (!held) {
            clearInterval(timer)
            this.logger.warn(
              `Idempotency key ${id} was taken over while its request was still running`
            )
          }
        },
        // A missed beat is tolerated: the lease allows a couple before a takeover
        (error: unknown) => this.logger.warn(`Idempotency heartbeat failed: ${String(error)}`)
      )
    }, IDEMPOTENCY_HEARTBEAT_MS)
    timer.unref() // never keeps the process alive on its own
    return timer
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()
    const key = request.header(IDEMPOTENCY_HEADER)
    if (key === undefined) return next.handle()
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException({
        code: ErrorCode.IDEMPOTENCY_KEY_INVALID,
        message: 'Idempotency-Key must be 1-255 printable ASCII characters'
      })
    }

    const routePath = (request.route as { path?: string } | undefined)?.path ?? request.path
    const scope = `${request.user?.id ?? 'anonymous'}:${request.method} ${routePath}`

    return from(this.idempotency.begin(scope, key, fingerprint(request))).pipe(
      mergeMap(result => {
        switch (result.kind) {
          case 'mismatch':
            throw new UnprocessableEntityException({
              code: ErrorCode.IDEMPOTENCY_KEY_REUSED,
              message: 'Idempotency-Key was already used with a different request'
            })
          case 'in_progress':
            throw new ConflictException({
              code: ErrorCode.IDEMPOTENCY_IN_PROGRESS,
              message: 'A request with this Idempotency-Key is still in progress'
            })
          case 'replay': {
            response.setHeader('Idempotent-Replayed', 'true')
            const status = result.record.responseStatus ?? 200
            if (status >= 400) {
              return throwError(
                () => new HttpException(result.record.responseBody as object, status)
              )
            }
            response.status(status)
            return of(result.record.responseBody)
          }
          case 'started': {
            const { id, lockId } = result.record
            // Nest applies @HttpCode (or 201 for POST) after interceptors run
            const successStatus =
              (Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()) as
                number | undefined) ?? (request.method === 'POST' ? 201 : 200)
            const heartbeat = this.startHeartbeat(id, lockId)
            return next.handle().pipe(
              mergeMap(async body => {
                await this.idempotency.complete(id, lockId, successStatus, body)
                return body
              }),
              catchError(async (error: unknown) => {
                const status = error instanceof HttpException ? error.getStatus() : 500
                if (status < 500) {
                  // Deterministic rejection: a retry would get the same answer
                  await this.idempotency.complete(
                    id,
                    lockId,
                    status,
                    (error as HttpException).getResponse()
                  )
                } else {
                  await this.idempotency.release(id, lockId)
                }
                throw error
              }),
              finalize(() => clearInterval(heartbeat))
            )
          }
        }
      })
    )
  }
}

/** SHA-256 over the JSON body (keys sorted) and the bytes of any uploaded files */
export function fingerprint(request: Request): string {
  const hash = createHash('sha256').update(stableStringify(request.body ?? null))
  const upload = request as unknown as UploadedFiles
  const files = upload.file
    ? [upload.file]
    : Array.isArray(upload.files)
      ? upload.files
      : Object.values(upload.files ?? {}).flat()
  for (const file of files) {
    if (file?.buffer) hash.update(file.buffer)
  }
  return hash.digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
