/**
 * Global test setup
 * This file runs once before all test suites
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

export default async function globalSetup() {
  // Load test environment variables
  const envPath = path.resolve(__dirname, '../.env.test');
  dotenv.config({ path: envPath });

  // Set test environment
  process.env.NODE_ENV = 'test';

  console.log('🧪 Global test setup complete');
  console.log(`📝 Database: ${process.env.TEST_DB_NAME} as ${process.env.TEST_DB_USERNAME}`);
}
