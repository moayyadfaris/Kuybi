import { Queue } from 'bullmq'

import { SessionCleanupScheduler } from '@modules/auth/jobs/session-cleanup.scheduler'
import { VersionCleanupScheduler } from '@modules/stories/jobs/version-cleanup.scheduler'

import { SessionCleanupJobType } from '@core/queues/jobs/types'

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

  afterAll(async () => {
    await sessionQueue.obliterate({ force: true })
    await versionQueue.obliterate({ force: true })
    await sessionQueue.close()
    await versionQueue.close()
  })

  const schedulers = async (queue: Queue) =>
    (await queue.getJobSchedulers()).map(s => ({ id: s.key, pattern: s.pattern, name: s.name }))

  it('schedules the session cleanup jobs once, however many workers start', async () => {
    const scheduler = new SessionCleanupScheduler(sessionQueue)
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
          id: 'session-expiring-check',
          pattern: '*/30 * * * *',
          name: SessionCleanupJobType.CHECK_EXPIRING
        },
        {
          id: 'password-reset-cleanup-daily',
          pattern: '30 3 * * *',
          name: SessionCleanupJobType.CLEANUP_RESET_TOKENS
        }
      ])
    )
    expect(await sessionQueue.getJobSchedulersCount()).toBe(3)
  })

  it('schedules the version cleanup jobs with their payloads', async () => {
    const scheduler = new VersionCleanupScheduler(versionQueue)
    await scheduler.onModuleInit()
    await scheduler.onModuleInit()

    const archive = await versionQueue.getJobScheduler('version-archive-weekly')
    expect(archive?.pattern).toBe('0 3 * * 0')
    expect(archive?.template?.data).toEqual({ olderThanDays: 90 })
    expect(await versionQueue.getJobSchedulersCount()).toBeGreaterThanOrEqual(1)
  })
})
