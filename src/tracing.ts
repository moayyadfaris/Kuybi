/**
 * Starts OpenTelemetry. main.ts imports this first: auto-instrumentation patches a library
 * (express, ioredis, the Redis client, pg) when it is loaded, so the SDK must be running
 * before the app's imports load any of them.
 */
import { initTracing } from '@core/observability/otel-sdk'

initTracing()
