/**
 * Health endpoints as probes read them: a load balancer or Kubernetes looks at the HTTP
 * status, not the body. An instance whose database or cache is unreachable must answer
 * 503 on /health/ready (and /health), so traffic is routed away from it.
 */
import { TypeOrmHealthIndicator } from '@nestjs/terminus'

import { HealthModule } from '@core/health/health.module'
import { S3HealthIndicator } from '@core/health/indicators/s3.health'

import { createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'

describe('Health endpoints', () => {
  let t: HttpTestApp

  beforeAll(async () => {
    t = await createHttpTestApp([HealthModule], { resetTables: [] })
  })

  // No network calls from tests: the S3 check answers "up" (its own logic is not under test)
  beforeEach(() =>
    jest
      .spyOn(S3HealthIndicator.prototype, 'isHealthy')
      .mockImplementation(async key => ({ [key]: { status: 'up' } }))
  )
  afterEach(() => jest.restoreAllMocks())
  afterAll(() => t.close())

  it('reports ready when the database and the cache answer', async () => {
    const res = await t.http().get('/api/health/ready').expect(200)
    expect(res.body.data).toMatchObject({ status: 'ready' })
  })

  it('answers 503 on /ready when the cache is down', async () => {
    jest.spyOn(t.cache, 'isHealthy').mockResolvedValue(false)
    await t.http().get('/api/health/ready').expect(503)
  })

  it('answers 503 on /ready when the database is down', async () => {
    // A transient provider: spy on every instance
    jest
      .spyOn(TypeOrmHealthIndicator.prototype, 'pingCheck')
      .mockRejectedValue(new Error('connection refused'))
    await t.http().get('/api/health/ready').expect(503)
  })

  it('answers 503 on /health when the cache is down', async () => {
    jest.spyOn(t.cache, 'isHealthy').mockResolvedValue(false)
    const res = await t.http().get('/api/health').expect(503)
    expect(JSON.stringify(res.body)).toContain('redis')
  })
})
