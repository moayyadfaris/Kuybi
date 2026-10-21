/**
 * Connection settings every app, worker and migration connection gets: bounded statement
 * and idle-transaction time (a stuck query or a forgotten transaction must not hold locks
 * forever), a name in pg_stat_activity, and for migrations a lock timeout (DDL waiting
 * for a lock blocks every query queued behind it) and one run at a time.
 */
import { withMigrationLock } from '@app/database/migration-lock'
import { DatabaseConfig, postgresOptions } from '@app/database/postgres-options'
import { DataSource } from 'typeorm'

import { testConfig } from '../../test.config'

const config: DatabaseConfig = {
  host: testConfig.database.host,
  port: testConfig.database.port,
  username: testConfig.database.username,
  password: testConfig.database.password,
  name: testConfig.database.database,
  logging: false,
  statementTimeoutMs: 45_000,
  idleInTransactionTimeoutMs: 50_000,
  migrationLockTimeoutMs: 7_000
}

describe('Database connections', () => {
  const open: DataSource[] = []
  const connect = async (purpose?: 'migrations') => {
    const dataSource = new DataSource(postgresOptions(config, purpose))
    open.push(await dataSource.initialize())
    return dataSource
  }
  const setting = async (dataSource: DataSource, name: string) =>
    (await dataSource.query(`SELECT current_setting($1) AS value`, [name]))[0].value

  afterAll(async () => {
    await Promise.all(open.map(dataSource => dataSource.destroy()))
  })

  it('bounds statements and idle transactions for the app', async () => {
    const app = await connect()

    expect(await setting(app, 'statement_timeout')).toBe('45s')
    expect(await setting(app, 'idle_in_transaction_session_timeout')).toBe('50s')
    expect(await setting(app, 'application_name')).toBe('kuybi')
  })

  it('lets migrations run long but not wait long for a lock', async () => {
    const migrations = await connect('migrations')

    expect(await setting(migrations, 'statement_timeout')).toBe('0')
    expect(await setting(migrations, 'lock_timeout')).toBe('7s')
    expect(await setting(migrations, 'application_name')).toBe('kuybi-migrations')
  })

  it('runs one migration run at a time', async () => {
    const [first, second] = await Promise.all([connect('migrations'), connect('migrations')])
    const order: string[] = []
    let releaseFirst!: () => void
    const firstHolds = new Promise<void>(resolve => (releaseFirst = resolve))

    const runFirst = withMigrationLock(first, async () => {
      order.push('first started')
      await firstHolds
      order.push('first finished')
    })
    await new Promise(resolve => setTimeout(resolve, 200))
    const runSecond = withMigrationLock(second, async () => order.push('second started'), {
      pollMs: 50
    })
    await new Promise(resolve => setTimeout(resolve, 300))
    releaseFirst()
    await Promise.all([runFirst, runSecond])

    expect(order).toEqual(['first started', 'first finished', 'second started'])
  })

  it('releases the lock when the run fails', async () => {
    const migrations = await connect('migrations')

    await expect(
      withMigrationLock(migrations, async () => {
        throw new Error('migration failed')
      })
    ).rejects.toThrow('migration failed')
    await expect(withMigrationLock(migrations, async () => 'next run')).resolves.toBe('next run')
  })
})
