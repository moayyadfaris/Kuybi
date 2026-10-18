import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import { LessThan, QueryFailedError, Repository } from 'typeorm'

import { IdempotencyKey } from './idempotency-key.entity'

/** How long a key's outcome is kept for replay */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
/**
 * An in-progress key whose lock is older than this belongs to a request that died
 * (process crash) and may be taken over by a retry. Longer than the slowest request
 * (large uploads), or a retry would run alongside a live one.
 */
export const IDEMPOTENCY_LEASE_MS = 5 * 60 * 1000

export type BeginResult =
  | { kind: 'started'; record: IdempotencyKey }
  | { kind: 'replay'; record: IdempotencyKey }
  | { kind: 'in_progress' }
  | { kind: 'mismatch' }

const UNIQUE_VIOLATION = '23505'

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repository: Repository<IdempotencyKey>
  ) {}

  /**
   * Claims the key for this request, or reports what a previous request with it did.
   * The unique (scope, key) index decides races: exactly one concurrent request starts.
   */
  async begin(scope: string, key: string, requestHash: string): Promise<BeginResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const record = await this.repository.save(
          this.repository.create({
            scope,
            key,
            requestHash,
            status: 'in_progress',
            lockId: randomUUID(),
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS)
          })
        )
        return { kind: 'started', record }
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
      }

      const existing = await this.repository.findOneBy({ scope, key })
      if (!existing) continue // released in between: try to claim it again
      if (existing.expiresAt.getTime() <= Date.now()) {
        await this.repository.delete({ id: existing.id })
        continue
      }
      if (existing.requestHash !== requestHash) return { kind: 'mismatch' }
      if (existing.status === 'in_progress') {
        const takenOver = await this.takeOverAbandoned(existing.id)
        return takenOver ? { kind: 'started', record: takenOver } : { kind: 'in_progress' }
      }
      return { kind: 'replay', record: existing }
    }
    return { kind: 'in_progress' }
  }

  /**
   * Claims a key whose holder stopped without completing or releasing it (the process
   * died). Age is judged in SQL on the database clock, which also wrote lockedAt: no
   * timestamp round-trips through JavaScript (millisecond) precision and no app/DB clock
   * skew. Postgres re-checks the WHERE clause after a concurrent update, so of several
   * retries exactly one gets the row; it receives a new lockId.
   */
  private async takeOverAbandoned(id: string): Promise<IdempotencyKey | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update(IdempotencyKey)
      .set({ lockedAt: () => 'now()', lockId: randomUUID() })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: 'in_progress' })
      .andWhere(`"lockedAt" < now() - make_interval(secs => :leaseSeconds)`, {
        leaseSeconds: IDEMPOTENCY_LEASE_MS / 1000
      })
      .returning('*')
      .execute()
    const rows = result.raw as IdempotencyKey[]
    return rows.length > 0 ? this.repository.create(rows[0]) : null
  }

  /**
   * Stores the outcome. Returns false if the attempt no longer holds the key (it was
   * taken over after its lease ran out); the newer attempt's outcome then stands.
   */
  async complete(
    id: string,
    lockId: string,
    responseStatus: number,
    responseBody: unknown
  ): Promise<boolean> {
    const result = await this.repository.update(
      { id, lockId, status: 'in_progress' },
      {
        status: 'completed',
        responseStatus,
        // jsonb column: undefined (a void handler) is stored as null
        responseBody: (responseBody ?? null) as object
      }
    )
    return !!result.affected
  }

  /** Forgets the key so the client may retry, if this attempt still holds it */
  async release(id: string, lockId: string): Promise<void> {
    await this.repository.delete({ id, lockId, status: 'in_progress' })
  }

  @Cron(CronExpression.EVERY_HOUR)
  async pruneExpired(): Promise<number> {
    const result = await this.repository.delete({ expiresAt: LessThan(new Date()) })
    return result.affected ?? 0
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION
  )
}
