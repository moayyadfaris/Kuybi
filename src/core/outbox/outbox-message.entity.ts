import type { KeepJobs } from 'bullmq'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export type OutboxStatus = 'pending' | 'dispatched' | 'failed'

/** BullMQ job options that are stored with the message (delays use availableAt) */
export interface OutboxJobOptions {
  priority?: number
  attempts?: number
  backoff?: { type: 'exponential' | 'fixed'; delay: number }
  removeOnComplete?: boolean | number | KeepJobs
  removeOnFail?: boolean | number | KeepJobs
}

/**
 * A background job recorded in the same transaction as the change that causes it, and
 * handed to BullMQ by OutboxRelay afterwards (transactional outbox).
 */
@Entity({ name: 'outbox_messages' })
@Index('IDX_outbox_messages_pending', ['availableAt'], { where: `"status" = 'pending'` })
export class OutboxMessage {
  /** Also the BullMQ jobId, so re-dispatching the same message cannot queue it twice */
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 100 })
  queue: string

  @Column({ type: 'varchar', length: 100 })
  jobName: string

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>

  @Column({ type: 'jsonb', default: () => "'{}'" })
  jobOptions: OutboxJobOptions

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: OutboxStatus

  @Column({ type: 'int', default: 0 })
  attempts: number

  /** Earliest dispatch time: now, or later for delayed jobs and retry backoff */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  availableAt: Date

  @Column({ type: 'text', nullable: true })
  lastError: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null
}
