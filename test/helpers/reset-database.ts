import { DataSource } from 'typeorm'

const LOCK_TIMEOUT = '10s'
const LOCK_NOT_AVAILABLE = '55P03'

/**
 * Truncate tables between tests without hanging forever.
 *
 * TRUNCATE needs an ACCESS EXCLUSIVE lock. If a request from a previous test is still
 * holding a lock, a plain TRUNCATE waits until Jest's hook timeout and every following
 * test fails the same way. Here the wait is capped by lock_timeout and the error lists
 * the sessions that were blocking, so the culprit shows up in the test output.
 */
export async function resetDatabase(dataSource: DataSource, tables: string[]): Promise<void> {
  const queryRunner = dataSource.createQueryRunner()
  await connectWithTimeout(dataSource, queryRunner.connect())
  try {
    await queryRunner.startTransaction()
    await queryRunner.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`)
    await queryRunner.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`)
    await queryRunner.commitTransaction()
  } catch (error) {
    await queryRunner.rollbackTransaction().catch(() => undefined)

    if ((error as { code?: string }).code === LOCK_NOT_AVAILABLE) {
      const blockers: Array<{ pid: number; state: string; xact_seconds: number; query: string }> =
        await dataSource.query(
          `SELECT pid, state, round(extract(epoch FROM now() - xact_start)) AS xact_seconds,
                  left(query, 200) AS query
             FROM pg_stat_activity
            WHERE datname = current_database()
              AND pid <> pg_backend_pid()
              AND xact_start IS NOT NULL`
        )
      throw new Error(
        `resetDatabase: TRUNCATE blocked for ${LOCK_TIMEOUT}. Open transactions:\n` +
          blockers
            .map(b => `  pid=${b.pid} state=${b.state} open=${b.xact_seconds}s query=${b.query}`)
            .join('\n')
      )
    }
    throw error
  } finally {
    await queryRunner.release()
  }
}

const CONNECT_TIMEOUT_MS = 10000

/**
 * A pool connection that never frees up means connections are being leaked by the code
 * under test. Fail with pool statistics instead of waiting for Jest's hook timeout.
 */
async function connectWithTimeout(dataSource: DataSource, connect: Promise<unknown>) {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const pool = (dataSource.driver as unknown as { master?: Record<string, number> }).master
      reject(
        new Error(
          `resetDatabase: no pool connection after ${CONNECT_TIMEOUT_MS}ms ` +
            `(total=${pool?.totalCount} idle=${pool?.idleCount} waiting=${pool?.waitingCount}). ` +
            'Connections are likely being leaked by the code under test.'
        )
      )
    }, CONNECT_TIMEOUT_MS)
  })
  try {
    await Promise.race([connect, timeout])
  } finally {
    clearTimeout(timer)
  }
}
