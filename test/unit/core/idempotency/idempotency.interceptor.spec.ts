import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  InternalServerErrorException
} from '@nestjs/common'
import { lastValueFrom, of, Subject, throwError } from 'rxjs'

import { fingerprint, IdempotencyInterceptor } from '@core/idempotency/idempotency.interceptor'
import { IDEMPOTENCY_HEARTBEAT_MS, IdempotencyService } from '@core/idempotency/idempotency.service'

const handler = function create() {}

function contextFor(userId: string | undefined, key: string | undefined, body: object = { a: 1 }) {
  const request = {
    method: 'POST',
    originalUrl: '/api/v1/stories?draft=1',
    path: '/api/v1/stories',
    query: { draft: '1' },
    body,
    user: userId ? { id: userId } : undefined,
    header: (name: string) => (name === 'idempotency-key' ? key : undefined)
  }
  const response = { setHeader: jest.fn(), status: jest.fn() }
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => handler
  } as unknown as ExecutionContext
}

function serviceWith(begin: IdempotencyService['begin']) {
  return {
    begin: jest.fn(begin),
    complete: jest.fn(),
    release: jest.fn(),
    renew: jest.fn().mockResolvedValue(true)
  }
}

describe('IdempotencyInterceptor', () => {
  it('answers 409 while the first request with the key is still running', async () => {
    const service = serviceWith(async () => ({ kind: 'in_progress' }))
    const next: CallHandler = { handle: jest.fn(() => of('ran')) }

    await expect(
      lastValueFrom(
        new IdempotencyInterceptor(service as never).intercept(contextFor('u1', 'k'), next)
      )
    ).rejects.toBeInstanceOf(ConflictException)
    expect(next.handle).not.toHaveBeenCalled()
  })

  it('releases the key after a 5xx so the client can retry', async () => {
    const service = serviceWith(async () => ({
      kind: 'started',
      record: { id: 'rec-1', lockId: 'lock-1' } as never
    }))
    const next: CallHandler = {
      handle: () => throwError(() => new InternalServerErrorException())
    }

    await expect(
      lastValueFrom(
        new IdempotencyInterceptor(service as never).intercept(contextFor('u1', 'k'), next)
      )
    ).rejects.toBeInstanceOf(InternalServerErrorException)
    expect(service.release).toHaveBeenCalledWith('rec-1', 'lock-1')
    expect(service.complete).not.toHaveBeenCalled()
  })

  it('stores the success with the route status (201 for POST)', async () => {
    const service = serviceWith(async () => ({
      kind: 'started',
      record: { id: 'rec-2', lockId: 'lock-2' } as never
    }))

    const body = await lastValueFrom(
      new IdempotencyInterceptor(service as never).intercept(contextFor('u1', 'k'), {
        handle: () => of({ id: 7 })
      })
    )

    expect(body).toEqual({ id: 7 })
    expect(service.complete).toHaveBeenCalledWith('rec-2', 'lock-2', 201, { id: 7 })
  })

  it('scopes keys per user and path (without the query)', async () => {
    const service = serviceWith(async () => ({ kind: 'started', record: { id: 'r' } as never }))
    const interceptor = new IdempotencyInterceptor(service as never)

    await lastValueFrom(interceptor.intercept(contextFor('alice', 'same'), { handle: () => of(1) }))
    await lastValueFrom(interceptor.intercept(contextFor('bob', 'same'), { handle: () => of(1) }))

    const scopes = service.begin.mock.calls.map(call => call[0])
    expect(scopes).toEqual(['alice:POST /api/v1/stories', 'bob:POST /api/v1/stories'])
  })

  it('passes through untouched without the header', async () => {
    const service = serviceWith(async () => ({ kind: 'in_progress' }))

    const body = await lastValueFrom(
      new IdempotencyInterceptor(service as never).intercept(contextFor('u1', undefined), {
        handle: () => of('normal')
      })
    )

    expect(body).toBe('normal')
    expect(service.begin).not.toHaveBeenCalled()
  })
})

describe('IdempotencyInterceptor heartbeat', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const started = () =>
    serviceWith(async () => ({ kind: 'started', record: { id: 'rec', lockId: 'lock' } as never }))

  it('renews the lock while the handler runs and stops when it finishes', async () => {
    const service = started()
    const response = new Subject<unknown>()
    const done = lastValueFrom(
      new IdempotencyInterceptor(service as never).intercept(contextFor('u1', 'k'), {
        handle: () => response
      })
    )
    await jest.advanceTimersByTimeAsync(0)

    await jest.advanceTimersByTimeAsync(IDEMPOTENCY_HEARTBEAT_MS * 3)
    expect(service.renew).toHaveBeenCalledTimes(3)
    expect(service.renew).toHaveBeenCalledWith('rec', 'lock')

    response.next({ id: 1 })
    response.complete()
    await done
    await jest.advanceTimersByTimeAsync(IDEMPOTENCY_HEARTBEAT_MS * 3)
    expect(service.renew).toHaveBeenCalledTimes(3)
  })

  it('stops renewing once the key was taken over', async () => {
    const service = started()
    service.renew.mockResolvedValue(false)
    const response = new Subject<unknown>()
    void lastValueFrom(
      new IdempotencyInterceptor(service as never).intercept(contextFor('u1', 'k'), {
        handle: () => response
      })
    ).catch(() => undefined)
    await jest.advanceTimersByTimeAsync(0)

    await jest.advanceTimersByTimeAsync(IDEMPOTENCY_HEARTBEAT_MS * 4)

    expect(service.renew).toHaveBeenCalledTimes(1)
    response.complete()
  })

  it('does not beat for requests that finish quickly', async () => {
    const service = started()

    await lastValueFrom(
      new IdempotencyInterceptor(service as never).intercept(contextFor('u1', 'k'), {
        handle: () => of('fast')
      })
    )
    await jest.advanceTimersByTimeAsync(IDEMPOTENCY_HEARTBEAT_MS * 3)

    expect(service.renew).not.toHaveBeenCalled()
  })
})

describe('fingerprint', () => {
  it('ignores key order but not values or file contents', () => {
    const req = (body: object, file?: Buffer) =>
      ({ body, file: file ? { buffer: file } : undefined }) as never

    expect(fingerprint(req({ a: 1, b: 2 }))).toBe(fingerprint(req({ b: 2, a: 1 })))
    expect(fingerprint(req({ a: 1 }))).not.toBe(fingerprint(req({ a: 2 })))
    expect(fingerprint(req({ a: 1 }, Buffer.from('x')))).not.toBe(
      fingerprint(req({ a: 1 }, Buffer.from('y')))
    )
  })
})
