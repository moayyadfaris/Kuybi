/**
 * Global test setup
 * This file runs once before all test suites
 * 
 * Register path aliases before loading entities
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

// Register path aliases from tsconfig before any entity imports
import 'tsconfig-paths/register'

import { DataSource } from 'typeorm'

export default async function globalSetup() {
  // Load test environment variables
  const envPath = path.resolve(__dirname, '..', '.env.test')
  dotenv.config({ path: envPath })

  // Set test environment
  process.env.NODE_ENV = 'test'

  console.log('🧪 Global test setup starting...')
  console.log(`📝 Database: ${process.env.TEST_DB_NAME} as ${process.env.TEST_DB_USERNAME}`)

  // Create DataSource to drop and recreate schema with all tables
  // Use glob patterns to auto-load all entities
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
    username: process.env.TEST_DB_USERNAME || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    database: process.env.TEST_DB_NAME || 'susanoo_test',
    entities: ['src/modules/**/*.entity.ts'],
    synchronize: false,
    logging: ['error', 'warn'], // Enable error logging to see what's failing
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
    
    // Enable required PostgreSQL extensions
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
    console.log('  ↳ Enabled uuid-ossp extension')
    
    // Close connection completely and create new DataSource instance
    await dataSource.destroy()
    
    // Create fresh DataSource to avoid TypeORM's internal caching issues
    const freshDataSource = new DataSource({
      type: 'postgres',
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
      username: process.env.TEST_DB_USERNAME || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
      database: process.env.TEST_DB_NAME || 'susanoo_test',
      entities: ['src/modules/**/*.entity.ts'],
      synchronize: true, // Enable auto-sync on fresh connection
      logging: ['error', 'warn'],
    })
    
    await freshDataSource.initialize()
    console.log('  ↳ Created all tables and relations')

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

