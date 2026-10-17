import { CallHandler, ExecutionContext, StreamableFile } from '@nestjs/common'
import { TransformInterceptor } from '@shared/interceptors/transform.interceptor'
import { lastValueFrom, of } from 'rxjs'

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor()
  const contextFor = (url: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ url }) }) }) as unknown as ExecutionContext
  const run = (url: string, value: unknown) =>
    lastValueFrom(
      interceptor.intercept(contextFor(url), { handle: () => of(value) } as CallHandler)
    )

  it('wraps JSON payloads in the success envelope', async () => {
    await expect(run('/api/v1/users/me', { id: 1 })).resolves.toEqual({
      success: true,
      data: { id: 1 }
    })
  })

  it('passes file downloads through untouched', async () => {
    const file = new StreamableFile(Buffer.from('binary'))

    await expect(run('/api/v1/attachments/1/download', file)).resolves.toBe(file)
  })

  it('passes raw buffers through untouched', async () => {
    const buffer = Buffer.from('raw')

    await expect(run('/api/v1/files/raw', buffer)).resolves.toBe(buffer)
  })

  it('does not wrap Prometheus metrics', async () => {
    await expect(run('/metrics', 'metric_total 1')).resolves.toBe('metric_total 1')
  })
})
