import { AppDataSource } from '../data-source'

async function runMigrations() {
  try {
    await AppDataSource.initialize()
    await AppDataSource.runMigrations()
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
