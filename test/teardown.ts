/**
 * Global test teardown
 * Runs once after all tests
 */
import { releaseTestDatabaseLock } from './helpers/run-lock'

export default async () => {
  await new Promise(resolve => setTimeout(resolve, 500))
  await releaseTestDatabaseLock()
}
