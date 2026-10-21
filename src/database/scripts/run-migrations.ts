import { AppDataSource } from '../data-source'
import { withMigrationLock } from '../migration-lock'

async function runMigrations() {
  try {
    await AppDataSource.initialize()
    // One transaction per migration, so a migration can opt out (transaction = false)
    // to build indexes CONCURRENTLY
    // One run at a time: deploys starting together must not apply a migration twice
    await withMigrationLock(AppDataSource, () =>
      AppDataSource.runMigrations({ transaction: 'each' })
    )
    console.log('Migrations executed successfully')
  } catch (error) {
    console.error('Failed to run migrations', error)
    process.exitCode = 1
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy()
    }
  }
}

runMigrations()
