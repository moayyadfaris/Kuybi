import { ENTITIES } from '@app/database/entities'
import { DataSource } from 'typeorm'

import { IDEMPOTENCY_LEASE_MS, IdempotencyService } from '@core/idempotency/idempotency.service'
import { IdempotencyKey } from '@core/idempotency/idempotency-key.entity'

import { testConfig } from '../../test.config'

describe('IdempotencyService (PostgreSQL)', () => {
  let dataSource: DataSource
  let service: IdempotencyService

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: testConfig.database.host,
      port: testConfig.database.port,
      username: testConfig.database.username,
      password: testConfig.database.password,
      database: testConfig.database.database,
      entities: ENTITIES
    })
    await dataSource.initialize()
    service = new IdempotencyService(dataSource.getRepository(IdempotencyKey))
  })

  beforeEach(() => dataSource.query('DELETE FROM idempotency_keys'))
  afterAll(async () => {
    await dataSource.query('DELETE FROM idempotency_keys')
    await dataSource.destroy()
  })

  it('lets exactly one of many concurrent requests with a key start', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => service.begin('u1:POST /x', 'race', 'hash'))
    )

    expect(results.filter(r => r.kind === 'started')).toHaveLength(1)
    expect(results.filter(r => r.kind === 'in_progress')).toHaveLength(9)
  })

  it('replays a completed outcome and detects a different request', async () => {
    const first = await service.begin('u1:POST /x', 'k', 'hash-a')
    if (first.kind !== 'started') throw new Error('expected started')
    await service.complete(first.record.id, 201, { id: 1 })

    const replay = await service.begin('u1:POST /x', 'k', 'hash-a')
    expect(replay).toMatchObject({
      kind: 'replay',
      record: { responseStatus: 201, responseBody: { id: 1 } }
    })
    expect((await service.begin('u1:POST /x', 'k', 'hash-b')).kind).toBe('mismatch')
  })

  it('treats an expired key as unused', async () => {
    const first = await service.begin('u1:POST /x', 'old', 'hash')
    if (first.kind !== 'started') throw new Error('expected started')
    await dataSource.getRepository(IdempotencyKey).update(first.record.id, {
      expiresAt: new Date(Date.now() - 1000)
    })

    expect((await service.begin('u1:POST /x', 'old', 'other-hash')).kind).toBe('started')
  })
  describe('crashed requests (lease)', () => {
    const startAndAge = async (key: string, ageMs: number) => {
      const first = await service.begin('u1:POST /x', key, 'hash')
      if (first.kind !== 'started') throw new Error('expected started')
      await dataSource.getRepository(IdempotencyKey).update(first.record.id, {
        lockedAt: new Date(Date.now() - ageMs)
      })
    }

    it('keeps answering 409 while the holder may still be running', async () => {
      await startAndAge('fresh', 60_000)

      expect((await service.begin('u1:POST /x', 'fresh', 'hash')).kind).toBe('in_progress')
    })

    it('lets a retry take over a key whose holder died', async () => {
      await startAndAge('crashed', IDEMPOTENCY_LEASE_MS + 1000)

      expect((await service.begin('u1:POST /x', 'crashed', 'hash')).kind).toBe('started')
    })

    it('hands an abandoned key to exactly one of many concurrent retries', async () => {
      await startAndAge('crashed-many', IDEMPOTENCY_LEASE_MS + 1000)

      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.begin('u1:POST /x', 'crashed-many', 'hash'))
      )

      expect(results.filter(r => r.kind === 'started')).toHaveLength(1)
    })

    it('still rejects a different request on an abandoned key', async () => {
      await startAndAge('crashed-other', IDEMPOTENCY_LEASE_MS + 1000)

      expect((await service.begin('u1:POST /x', 'crashed-other', 'other')).kind).toBe('mismatch')
    })
  })
})
