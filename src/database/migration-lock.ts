import { DataSource } from 'typeorm'

/** pg advisory lock key for migration runs (any constant shared by every run) */
const MIGRATION_LOCK_KEY = 7_302_215_001

/**
 * Runs `work` while holding the migration lock: two deploys (or instances) starting at
 * once must not apply the same migrations concurrently. A second run waits for the
 * first to finish, then finds nothing left to do. The lock is a session advisory lock
 * on a dedicated connection, so it is released even if the process dies.
 */
export async function withMigrationLock<T>(
  dataSource: DataSource,
  work: () => Promise<T>,
  { pollMs = 1000, maxWaitMs = 15 * 60 * 1000 } = {}
): Promise<T> {
  const runner = dataSource.createQueryRunner()
  await runner.connect()
  try {
    const deadline = Date.now() + maxWaitMs
    // Polled with try-lock: a blocking pg_advisory_lock would be cut off by lock_timeout
    while (
      !(await runner.query('SELECT pg_try_advisory_lock($1) AS locked', [MIGRATION_LOCK_KEY]))[0]
        .locked
    ) {
      if (Date.now() > deadline) {
        throw new Error('Another migration run still holds the migration lock')
      }
      await new Promise(resolve => setTimeout(resolve, pollMs))
    }
    try {
      return await work()
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
    }
  } finally {
    await runner.release()
  }
}
