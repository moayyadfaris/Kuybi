/**
 * Global test setup
 * This file runs once before all test suites
 *
 * Register path aliases before loading entities
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import { DataSource } from 'typeorm'

// Register path aliases from tsconfig before any entity imports
import 'tsconfig-paths/register'

import { acquireTestDatabaseLock } from './helpers/run-lock'

export default async function globalSetup() {
  // Load test environment variables
  const envPath = path.resolve(__dirname, '..', '.env.test')
  dotenv.config({ path: envPath })

  // Set test environment
  process.env.NODE_ENV = 'test'

  console.log('🧪 Global test setup starting...')
  console.log(`📝 Database: ${process.env.TEST_DB_NAME} as ${process.env.TEST_DB_USERNAME}`)

  // Refuse to share the database with another concurrent integration run
  await acquireTestDatabaseLock({
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
    user: process.env.TEST_DB_USERNAME || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    database: process.env.TEST_DB_NAME || 'kuybi_test'
  })

  // Connection used only to drop and recreate the schema
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
    username: process.env.TEST_DB_USERNAME || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    database: process.env.TEST_DB_NAME || 'kuybi_test',
    entities: ['src/modules/**/*.entity.ts'],
    synchronize: false,
    logging: ['error', 'warn'] // Enable error logging to see what's failing
  })

  try {
    await dataSource.initialize()

    console.log(`  ↳ Loaded ${dataSource.entityMetadatas.length} entities`)
    // Removed detailed listing - checked and confirmed duplicates

    // Drop and recreate schema completely (CASCADE removes all objects)
    await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE;')
    await dataSource.query('CREATE SCHEMA public;')
    await dataSource.query(`GRANT ALL ON SCHEMA public TO ${process.env.TEST_DB_USERNAME};`)
    await dataSource.query('GRANT ALL ON SCHEMA public TO public;')
    console.log('  ↳ Dropped and recreated public schema')

    // Close connection completely and create new DataSource instance
    await dataSource.destroy()

    // Build the schema with the real migrations (not synchronize), so every run
    // exercises them and fails if they drift from the entities
    const freshDataSource = new DataSource({
      type: 'postgres',
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
      username: process.env.TEST_DB_USERNAME || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
      database: process.env.TEST_DB_NAME || 'kuybi_test',
      entities: ['src/modules/**/*.entity.ts'],
      migrations: [path.resolve(__dirname, '..', 'src/core/database/migrations/*.ts')],
      migrationsTableName: 'migrations',
      synchronize: false,
      logging: ['error', 'warn']
    })

    await freshDataSource.initialize()
    const executed = await freshDataSource.runMigrations({ transaction: 'each' })
    console.log(`  ↳ Ran ${executed.length} migration(s)`)

    const pending = await freshDataSource.driver.createSchemaBuilder().log()
    if (pending.upQueries.length > 0) {
      const sample = pending.upQueries
        .slice(0, 5)
        .map(q => `    ${q.query}`)
        .join('\n')
      await freshDataSource.destroy()
      throw new Error(
        `Migrations are out of sync with the entities (${pending.upQueries.length} pending ` +
          `change(s)). Run \`npm run migration:generate src/core/database/migrations/<Name>\`.\n${sample}`
      )
    }

    await freshDataSource.destroy()
    console.log('✅ Test database schema setup complete')
  } catch (error) {
    console.error('❌ Failed to setup test database:', error)
    if (dataSource?.isInitialized) {
      await dataSource.destroy()
    }
    throw error
  }
}
