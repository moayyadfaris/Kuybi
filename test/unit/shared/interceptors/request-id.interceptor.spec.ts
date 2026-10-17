import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common'
import { RequestIdInterceptor } from '@shared/interceptors/request-id.interceptor'
import { lastValueFrom, of } from 'rxjs'

describe('RequestIdInterceptor', () => {
  const interceptor = new RequestIdInterceptor()
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ id: 'req-1' }) })
  } as unknown as ExecutionContext
  const run = (value: unknown) =>
    lastValueFrom(interceptor.intercept(context, { handle: () => of(value) } as CallHandler))

  it('adds the request id to JSON objects', async () => {
    await expect(run({ ok: true })).resolves.toEqual({ ok: true, requestId: 'req-1' })
  })

  it('leaves file downloads intact', async () => {
    const file = new StreamableFile(Buffer.from('binary'))

    await expect(run(file)).resolves.toBe(file)
  })

  it('leaves arrays and primitives intact', async () => {
    await expect(run([1, 2])).resolves.toEqual([1, 2])
    await expect(run('text')).resolves.toBe('text')
  })
})
