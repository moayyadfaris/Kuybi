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
    await service.complete(first.record.id, first.record.lockId, 201, { id: 1 })

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

    // A real crash leaves the lock as written by Postgres (microsecond precision, set in
    // SQL), not by JavaScript (milliseconds), so age it in SQL too
    it('takes over a key whose lock was set by the database clock', async () => {
      const first = await service.begin('u1:POST /x', 'crashed-db-clock', 'hash')
      if (first.kind !== 'started') throw new Error('expected started')
      await dataSource.query(
        `UPDATE idempotency_keys SET "lockedAt" = now() - interval '10 minutes' WHERE id = $1`,
        [first.record.id]
      )

      expect((await service.begin('u1:POST /x', 'crashed-db-clock', 'hash')).kind).toBe('started')
    })

    it('hands an abandoned key to exactly one of many concurrent retries', async () => {
      await startAndAge('crashed-many', IDEMPOTENCY_LEASE_MS + 1000)

      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.begin('u1:POST /x', 'crashed-many', 'hash'))
      )

      expect(results.filter(r => r.kind === 'started')).toHaveLength(1)
    })

    it('ignores a superseded attempt that finishes after the takeover', async () => {
      const original = await service.begin('u1:POST /x', 'slow', 'hash')
      if (original.kind !== 'started') throw new Error('expected started')
      await dataSource.query(
        `UPDATE idempotency_keys SET "lockedAt" = now() - interval '10 minutes' WHERE id = $1`,
        [original.record.id]
      )
      const retry = await service.begin('u1:POST /x', 'slow', 'hash')
      if (retry.kind !== 'started') throw new Error('expected takeover')

      // The slow original finally answers: it no longer holds the key
      expect(
        await service.complete(original.record.id, original.record.lockId, 201, { from: 'old' })
      ).toBe(false)
      await service.release(original.record.id, original.record.lockId)

      expect(
        await service.complete(retry.record.id, retry.record.lockId, 201, { from: 'retry' })
      ).toBe(true)
      const replay = await service.begin('u1:POST /x', 'slow', 'hash')
      expect(replay).toMatchObject({ kind: 'replay', record: { responseBody: { from: 'retry' } } })
    })

    it('still rejects a different request on an abandoned key', async () => {
      await startAndAge('crashed-other', IDEMPOTENCY_LEASE_MS + 1000)

      expect((await service.begin('u1:POST /x', 'crashed-other', 'other')).kind).toBe('mismatch')
    })
  })
})
