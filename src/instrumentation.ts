/**
 * OpenTelemetry Instrumentation Entry Point
 *
 * This file MUST be loaded BEFORE any application code to ensure
 * auto-instrumentation can properly monkey-patch HTTP, database, and
 * other modules.
 *
 * Usage:
 *   node --require ./dist/instrumentation.js dist/main.js
 *
 * Or via package.json script:
 *   NODE_OPTIONS='--require ./dist/instrumentation.js' npm run start
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env file BEFORE initializing OpenTelemetry
// This ensures OTEL_* environment variables are available
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import { initializeOpenTelemetry } from '@core/observability/instrumentation/otel-init'

// Initialize OpenTelemetry SDK
initializeOpenTelemetry()

console.log('🔧 Instrumentation loaded successfully (OpenTelemetry auto-instrumentation active)')
