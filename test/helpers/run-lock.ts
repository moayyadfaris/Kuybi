import { Client } from 'pg'

/**
 * Exclusive lock on the test database for the duration of an integration run.
 *
 * globalSetup drops and recreates the schema and every suite truncates tables, so two
 * runs against the same database corrupt each other (missing relations, users deleted
 * mid-test, TRUNCATE waiting on the other run's locks). A session-level advisory lock,
 * held by a dedicated connection until globalTeardown, makes a second run fail fast with
 * a clear message instead. If the process dies, Postgres releases the lock with the
 * connection.
 */
const LOCK_KEY = 427_001 // arbitrary, constant per project
const LOCK_HOLDER = '__KUYBI_TEST_DB_LOCK__'

type LockHolder = { [LOCK_HOLDER]?: Client }

export async function acquireTestDatabaseLock(config: {
  host: string
  port: number
  user: string
  password: string
  database: string
}): Promise<void> {
  const client = new Client(config)
  await client.connect()

  const { rows } = await client.query<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [LOCK_KEY]
  )
  if (!rows[0].locked) {
    await client.end()
    throw new Error(
      `Another integration test run is already using database "${config.database}". ` +
        "Concurrent runs drop and truncate each other's tables; wait for it to finish " +
        '(or point this run at a different TEST_DB_NAME).'
    )
  }

  ;(globalThis as LockHolder)[LOCK_HOLDER] = client
}

export async function releaseTestDatabaseLock(): Promise<void> {
  const holder = globalThis as LockHolder
  const client = holder[LOCK_HOLDER]
  if (!client) {
    return
  }
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY])
  } finally {
    await client.end()
    holder[LOCK_HOLDER] = undefined
  }
}
