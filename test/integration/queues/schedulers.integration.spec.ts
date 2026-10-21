import { ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'

import { AttachmentsJobsScheduler } from '@modules/attachments/jobs/attachments-jobs.scheduler'
import { AuditRetentionScheduler } from '@modules/audit/jobs/audit-retention.scheduler'
import { AuthJobsScheduler } from '@modules/auth/jobs/auth-jobs.scheduler'
import { VersionCleanupScheduler } from '@modules/stories/jobs/version-cleanup.scheduler'

import {
  AttachmentJobType,
  AuditRetentionJobType,
  SessionCleanupJobType,
  VersionCleanupJobType
} from '@core/queues/jobs/types'

import { testConfig } from '../../test.config'

const connection = {
  host: testConfig.redis.host,
  port: testConfig.redis.port,
  db: testConfig.redis.db
}

describe('Job schedulers (BullMQ job schedulers on real Redis)', () => {
  // Own prefix: never touches other queues in the (shared) Redis
  const prefix = `kuybi-test-${process.pid}`
  const sessionQueue = new Queue('session-cleanup', { connection, prefix })
  const versionQueue = new Queue('version-cleanup', { connection, prefix })
  const accountQueue = new Queue('account-security', { connection, prefix })
  const auditQueue = new Queue('audit-retention', { connection, prefix })
  const attachmentQueue = new Queue('attachment-processing', { connection, prefix })

  afterAll(async () => {
    await sessionQueue.obliterate({ force: true })
    await versionQueue.obliterate({ force: true })
    await accountQueue.obliterate({ force: true })
    await auditQueue.obliterate({ force: true })
    await attachmentQueue.obliterate({ force: true })
    await attachmentQueue.close()
    await auditQueue.close()
    await accountQueue.close()
    await sessionQueue.close()
    await versionQueue.close()
  })

  const schedulers = async (queue: Queue) =>
    (await queue.getJobSchedulers()).map(s => ({ id: s.key, pattern: s.pattern, name: s.name }))

  it('schedules the session cleanup jobs once, however many workers start', async () => {
    const scheduler = new AuthJobsScheduler(sessionQueue, accountQueue)
    await scheduler.onModuleInit()
    await scheduler.onModuleInit() // a second worker / restart

    expect(await schedulers(sessionQueue)).toEqual(
      expect.arrayContaining([
        {
          id: 'session-cleanup-hourly',
          pattern: '0 * * * *',
          name: SessionCleanupJobType.CLEANUP_EXPIRED
        },
        {
          id: 'password-reset-cleanup-daily',
          pattern: '30 3 * * *',
          name: SessionCleanupJobType.CLEANUP_RESET_TOKENS
        }
      ])
    )
    expect(await sessionQueue.getJobSchedulersCount()).toBe(2)
  })

  it('schedules the daily version prune and retires the weekly archive job', async () => {
    await versionQueue.upsertJobScheduler(
      'version-archive-weekly',
      { pattern: '0 3 * * 0' },
      { name: 'archive-old-versions', data: {} }
    )
    const config = { get: () => 7 } as unknown as ConfigService
    const scheduler = new VersionCleanupScheduler(versionQueue, config)
    await scheduler.onModuleInit()
    await scheduler.onModuleInit()

    const prune = await versionQueue.getJobScheduler('version-cleanup-daily')
    expect(prune?.pattern).toBe('0 2 * * *')
    // "02:00" means UTC, whatever the server's time zone
    expect(prune?.tz).toBe('UTC')
    expect(prune?.name).toBe(VersionCleanupJobType.PRUNE_AUTO)
    expect(prune?.template?.data).toEqual({ keepAutoVersions: 7 })
    expect(await versionQueue.getJobScheduler('version-archive-weekly')).toBeFalsy()
    expect(await versionQueue.getJobSchedulersCount()).toBe(1)
  })

  it('schedules the daily audit purge with the configured retention', async () => {
    const settings: Record<string, number> = {
      'audit.retentionDays': 180,
      'audit.criticalRetentionDays': 365
    }
    const config = { get: (key: string) => settings[key] } as unknown as ConfigService
    const scheduler = new AuditRetentionScheduler(auditQueue, config)
    await scheduler.onModuleInit()
    await scheduler.onModuleInit()

    const purge = await auditQueue.getJobScheduler('audit-retention-daily')
    expect(purge?.pattern).toBe('0 3 * * *')
    expect(purge?.name).toBe(AuditRetentionJobType.PURGE_EXPIRED)
    expect(purge?.template?.data).toEqual({ retentionDays: 180, criticalRetentionDays: 365 })
    expect(await auditQueue.getJobSchedulersCount()).toBe(1)
  })

  it('schedules the abandoned-upload cleanup in the worker, hourly in UTC', async () => {
    const scheduler = new AttachmentsJobsScheduler(attachmentQueue)
    await scheduler.onModuleInit()
    await scheduler.onModuleInit()

    const cleanup = await attachmentQueue.getJobScheduler('abandoned-uploads-hourly')
    expect(cleanup).toMatchObject({
      pattern: '15 * * * *',
      tz: 'UTC',
      name: AttachmentJobType.REMOVE_ABANDONED_UPLOADS
    })
    expect(await attachmentQueue.getJobSchedulersCount()).toBe(1)
  })
})
