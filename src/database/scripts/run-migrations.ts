import { AppDataSource } from '../data-source'

async function runMigrations() {
  try {
    await AppDataSource.initialize()
    // One transaction per migration, so a migration can opt out (transaction = false)
    // to build indexes CONCURRENTLY
    await AppDataSource.runMigrations({ transaction: 'each' })
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
