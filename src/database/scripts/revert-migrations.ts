import { AppDataSource } from '../data-source'

async function revertMigrations() {
  try {
    await AppDataSource.initialize()
    await AppDataSource.undoLastMigration()
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
