/**
 * Jest setup file
 * Runs once per test file
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load test environment variables
const envPath = path.resolve(__dirname, '../.env.test')
dotenv.config({ path: envPath })

// Set test environment
process.env.NODE_ENV = 'test'

// Increase timeout for integration tests
jest.setTimeout(30000)
