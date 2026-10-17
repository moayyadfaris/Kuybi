import { ConfigService } from '@nestjs/config'
import { HealthIndicatorService } from '@nestjs/terminus'
import { S3Client } from '@aws-sdk/client-s3'

import { S3HealthIndicator } from '@core/health/indicators/s3.health'

describe('S3HealthIndicator', () => {
  const config = (bucket?: string) =>
    ({ get: (key: string) => (key === 's3.bucket' ? bucket : 'us-east-1') }) as ConfigService

  afterEach(() => jest.restoreAllMocks())

  it('reports up with the bucket and response time when S3 responds', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never)
    const indicator = new S3HealthIndicator(config('assets'), new HealthIndicatorService())

    const result = await indicator.isHealthy('s3')

    expect(result.s3.status).toBe('up')
    expect(result.s3.bucket).toBe('assets')
    expect(result.s3.responseTime).toMatch(/ms$/)
  })

  it('reports down with the error when S3 fails', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('AccessDenied') as never)
    const indicator = new S3HealthIndicator(config('assets'), new HealthIndicatorService())

    const result = await indicator.isHealthy('s3')

    expect(result.s3).toMatchObject({ status: 'down', error: 'AccessDenied' })
  })

  it('reports down when no bucket is configured', async () => {
    const indicator = new S3HealthIndicator(config(undefined), new HealthIndicatorService())

    const result = await indicator.isHealthy('s3')

    expect(result.s3).toMatchObject({ status: 'down', error: 'S3 bucket name is not configured' })
  })
})
