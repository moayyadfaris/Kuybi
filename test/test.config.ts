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
  // Where emailed links point (the site, not the API)
  app: { publicUrl: 'https://www.kuybi.test' },
  database: {
    type: 'postgres',
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
    username: process.env.TEST_DB_USERNAME || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'postgres',
    database: process.env.TEST_DB_NAME || 'kuybi_test',
    synchronize: false, // Schema is built by the real migrations in global setup
    dropSchema: false,
    logging: false // Disable SQL logging in tests
  },
  redis: {
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: parseInt(process.env.TEST_REDIS_PORT || '6379', 10),
    db: parseInt(process.env.TEST_REDIS_DB || '15', 10) // Use DB 15 for tests
  },
  // Lowest bcrypt cost: hashing speed is not under test here
  security: { bcryptRounds: 4 },
  auth: {
    // No calls to Have I Been Pwned from tests
    enableBreachDetection: false,
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
  },
  s3: {
    bucket:
      process.env.S3_BUCKET ||
      process.env.AWS_S3_BUCKET ||
      process.env.S3_BUCKET_NAME ||
      'test-bucket',
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    baseUrl: process.env.S3_BASE_URL || process.env.AWS_S3_ENDPOINT || '',
    // Tests never call real S3; dummy keys let S3Service start without a .env.test (CI)
    accessKeyId: process.env.S3_ACCESS || 'test-access-key',
    secretAccessKey: process.env.S3_SECRET || 'test-secret-key'
  }
}
