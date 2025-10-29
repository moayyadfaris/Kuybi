/**
 * Test configuration
 * Override production config for testing
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load test environment variables at configuration time
const envPath = path.resolve(__dirname, '../.env.test')
dotenv.config({ path: envPath })

export const testConfig = {
  database: {
    type: 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
    username: process.env.TEST_DB_USERNAME || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    database: process.env.TEST_DB_NAME || 'susanoo_test',
    synchronize: true, // Auto-sync schema for tests  
    dropSchema: false, // Schema dropped in global setup
    logging: false, // Disable SQL logging in tests
  },
  redis: {
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: parseInt(process.env.TEST_REDIS_PORT || '6379', 10),
    db: parseInt(process.env.TEST_REDIS_DB || '15', 10) // Use DB 15 for tests
  },
  auth: {
    jwtSecret: 'test-secret-key-do-not-use-in-production',
    jwtRefreshSecret: 'test-refresh-secret-key',
    jwtAccessExpiresIn: '1h',
    jwtRefreshExpiresIn: '7d'
  },
  aws: {
    region: 'us-east-1',
    s3: {
      bucket: 'test-bucket',
      endpoint: 'http://localhost:9000' // MinIO for local S3 testing
    }
  }
}
