import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export type IdempotencyStatus = 'in_progress' | 'completed'

/** Outcome of a request made with an Idempotency-Key, replayed for retries with that key */
@Entity({ name: 'idempotency_keys' })
@Index('UQ_idempotency_keys_scope_key', ['scope', 'key'], { unique: true })
@Index('IDX_idempotency_keys_expires_at', ['expiresAt'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** `<user id or "anonymous">:<METHOD> <route>`: keys never collide across users or routes */
  @Column({ type: 'varchar', length: 300 })
  scope: string

  @Column({ type: 'varchar', length: 255 })
  key: string

  /** SHA-256 of the request body and uploaded files */
  @Column({ type: 'varchar', length: 64 })
  requestHash: string

  @Column({ type: 'varchar', length: 20, default: 'in_progress' })
  status: IdempotencyStatus

  @Column({ type: 'int', nullable: true })
  responseStatus: number | null

  @Column({ type: 'jsonb', nullable: true })
  responseBody: unknown

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  /** When the attempt now holding the key started (database clock); old means it died */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  lockedAt: Date

  /**
   * Fencing token of the attempt holding the key. A takeover issues a new one, so a
   * superseded attempt that finishes late cannot complete or release the key.
   */
  @Column({ type: 'uuid', default: () => 'uuid_generate_v4()' })
  lockId: string

  @Column({ type: 'timestamptz' })
  expiresAt: Date
}
