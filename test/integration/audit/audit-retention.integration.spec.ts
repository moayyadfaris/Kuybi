/**
 * Audit retention: a daily job deletes rows older than AUDIT_RETENTION_DAYS, and critical
 * rows older than AUDIT_CRITICAL_RETENTION_DAYS. 0 keeps rows forever.
 */
import { Job, Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

import { AuditModule } from '@modules/audit/audit.module'
import { AuditLogRepository } from '@modules/audit/database/audit-log.repository'
import { AuditAction, AuditLog, AuditSeverity } from '@modules/audit/entities/audit-log.entity'
import { AuditRetentionProcessor } from '@modules/audit/jobs/audit-retention.processor'

import { AuditRetentionJobType } from '@core/queues/jobs/types'

import { createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = ['audit_logs', 'sessions', 'user_roles', 'role_permissions', 'users', 'roles']
const DAY = 24 * 60 * 60 * 1000

describe('Audit retention', () => {
  let t: HttpTestApp
  let processor: AuditRetentionProcessor

  const purge = (retentionDays: number, criticalRetentionDays: number) =>
    processor.process({
      id: '1',
      name: AuditRetentionJobType.PURGE_EXPIRED,
      data: { retentionDays, criticalRetentionDays }
    } as Job)

  /** One row per [description, severity, age in days] */
  const seed = (rows: Array<[string, AuditSeverity, number]>) =>
    t.dataSource.getRepository(AuditLog).save(
      rows.map(([description, severity, age]) => ({
        action: AuditAction.LOGIN,
        description,
        severity,
        createdAt: new Date(Date.now() - age * DAY)
      })) as AuditLog[]
    )
  const remaining = async () =>
    (await t.dataSource.getRepository(AuditLog).find()).map(log => log.description).sort()

  beforeAll(async () => {
    t = await createHttpTestApp([AuditModule], { resetTables: TABLES })
    processor = new AuditRetentionProcessor(
      t.app.get(AuditLogRepository),
      { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
      {} as Queue
    )
  })

  beforeEach(() => t.dataSource.query('DELETE FROM audit_logs'))

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('deletes rows past their retention, keeping critical rows longer', async () => {
    await seed([
      ['low-recent', AuditSeverity.LOW, 179],
      ['low-old', AuditSeverity.LOW, 181],
      ['high-old', AuditSeverity.HIGH, 181],
      ['critical-recent', AuditSeverity.CRITICAL, 364],
      ['critical-old', AuditSeverity.CRITICAL, 366]
    ])

    await expect(purge(180, 365)).resolves.toEqual({ deleted: 3 })
    expect(await remaining()).toEqual(['critical-recent', 'low-recent'])
  })

  it('keeps everything when retention is 0, and critical rows at least as long as others', async () => {
    await seed([
      ['low-old', AuditSeverity.LOW, 1000],
      ['critical-old', AuditSeverity.CRITICAL, 1000]
    ])
    await expect(purge(0, 0)).resolves.toEqual({ deleted: 0 })

    await seed([['critical-200', AuditSeverity.CRITICAL, 200]])
    // A critical retention shorter than the general one does not delete critical rows first
    await purge(365, 30)
    expect(await remaining()).toEqual(['critical-200'])
  })

  it('no longer has per-row retention columns', async () => {
    const columns = await t.dataSource.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'audit_logs'
         AND column_name IN ('retentionDays', 'isArchived', 'archivedAt')`
    )
    expect(columns).toEqual([])
  })
})
