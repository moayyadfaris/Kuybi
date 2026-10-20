import { DataSource } from 'typeorm'

import { AppDataSource } from '../data-source'

/**
 * TypeORM's undoLastMigration ignores a migration's own `transaction = false` and wraps
 * down() in a transaction anyway, which breaks DROP/CREATE INDEX CONCURRENTLY. Pick the
 * mode from the migration being reverted.
 */
async function transactionModeForLast(dataSource: DataSource): Promise<'each' | 'none'> {
  const [last] = await dataSource.query(
    `SELECT "name" FROM "migrations" ORDER BY "timestamp" DESC LIMIT 1`
  )
  const migration = dataSource.migrations.find(m => m.name === last?.name)
  return migration?.transaction === false ? 'none' : 'each'
}

async function revertMigrations() {
  try {
    await AppDataSource.initialize()
    await AppDataSource.undoLastMigration({
      transaction: await transactionModeForLast(AppDataSource)
    })
    console.log('Last migration reverted successfully')
  } catch (error) {
    console.error('Failed to revert migration', error)
    process.exitCode = 1
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  }
}

revertMigrations()
