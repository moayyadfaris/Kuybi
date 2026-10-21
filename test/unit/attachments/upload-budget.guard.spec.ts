/**
 * Multipart uploads are buffered in memory, so their size is checked before any byte is
 * read: per request (declared Content-Length) and per process (bytes of uploads in
 * flight), so concurrent uploads cannot exhaust the API's memory either.
 */
import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  PayloadTooLargeException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter } from 'events'

import { UploadBudgetGuard } from '@modules/attachments/guards/upload-budget.guard'
import { MAX_UPLOAD_BYTES } from '@modules/attachments/services/file-validation.service'

const MB = 1024 * 1024

describe('UploadBudgetGuard', () => {
  const guardWith = (inFlightBytes: number) =>
    new UploadBudgetGuard({
      get: (key: string, fallback?: unknown) =>
        key === 'attachments.maxInFlightUploadBytes' ? inFlightBytes : fallback
    } as unknown as ConfigService)

  const upload = (contentLength?: number) => {
    const response = Object.assign(new EventEmitter(), { setHeader: jest.fn() })
    const request = {
      headers: contentLength === undefined ? {} : { 'content-length': String(contentLength) }
    }
    const context = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response })
    } as unknown as ExecutionContext
    return { context, finish: () => response.emit('close'), response }
  }
  const status = (fn: () => unknown) => {
    try {
      fn()
      return 'allowed'
    } catch (error) {
      return (error as HttpException).getStatus()
    }
  }

  it('needs a declared size', () => {
    expect(status(() => guardWith(300 * MB).canActivate(upload().context))).toBe(
      HttpStatus.LENGTH_REQUIRED
    )
  })

  it('refuses a request larger than one file may be', () => {
    expect(() =>
      guardWith(300 * MB).canActivate(upload(MAX_UPLOAD_BYTES + 2 * MB).context)
    ).toThrow(PayloadTooLargeException)
  })

  it('caps the bytes of uploads in flight, and frees them when a request ends', () => {
    const guard = guardWith(150 * MB)
    const first = upload(90 * MB)
    expect(guard.canActivate(first.context)).toBe(true)

    const second = upload(90 * MB)
    expect(status(() => guard.canActivate(second.context))).toBe(HttpStatus.SERVICE_UNAVAILABLE)
    expect(second.response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String))

    first.finish()
    expect(guard.canActivate(upload(90 * MB).context)).toBe(true)
  })
})
