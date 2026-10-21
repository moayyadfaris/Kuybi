import { readFileSync } from 'fs'
import type { DataSourceOptions } from 'typeorm'

import { ENTITIES } from './entities'

type PostgresConnectionOptions = Extract<DataSourceOptions, { type: 'postgres' }>

/** The `database` block of the app configuration */
export interface DatabaseConfig {
  host: string
  port: number
  username: string
  password: string
  name: string
  logging: boolean
  ssl?: {
    enabled: boolean
    /** Verify the server certificate (default true) */
    rejectUnauthorized?: boolean
    /** PEM file of the CA that signed the server certificate (e.g. the RDS bundle) */
    caFile?: string
  }
  pool?: {
    enabled: boolean
    min?: number
    max?: number
    idleTimeoutMillis?: number
    acquireTimeoutMillis?: number
  }
  /** Longest a single statement may run (app and worker; 0 = no limit) */
  statementTimeoutMs?: number
  /** Longest a connection may sit inside an open transaction doing nothing */
  idleInTransactionTimeoutMs?: number
  /** Longest a migration waits for a lock before failing */
  migrationLockTimeoutMs?: number
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000

/**
 * Connection options shared by the API, the worker and the migration scripts, so they
 * cannot drift apart.
 *
 * - The app's statements and idle transactions are time-bounded: a runaway query or a
 *   transaction left open must not hold row locks (and a pool connection) forever.
 * - Migrations may run long (index builds), but give up quickly when they cannot get a
 *   lock: DDL waiting for a lock blocks every query queued behind it.
 * - TLS verifies the server certificate; DB_SSL_REJECT_UNAUTHORIZED=false is refused
 *   outside development/test.
 */
export function postgresOptions(
  database: DatabaseConfig,
  purpose: 'app' | 'migrations' = 'app'
): PostgresConnectionOptions {
  const pool = database.pool
  const session =
    purpose === 'migrations'
      ? {
          application_name: 'kuybi-migrations',
          statement_timeout: 0,
          lock_timeout: database.migrationLockTimeoutMs ?? 10_000
        }
      : {
          application_name: 'kuybi',
          statement_timeout: database.statementTimeoutMs ?? 60_000,
          idle_in_transaction_session_timeout: database.idleInTransactionTimeoutMs ?? 60_000
        }

  return {
    type: 'postgres',
    host: database.host,
    port: database.port,
    username: database.username,
    password: database.password,
    database: database.name,
    entities: ENTITIES,
    synchronize: false,
    logging: database.logging,
    ssl: database.ssl?.enabled
      ? {
          rejectUnauthorized: database.ssl.rejectUnauthorized ?? true,
          ...(database.ssl.caFile ? { ca: readFileSync(database.ssl.caFile, 'utf8') } : {})
        }
      : false,
    extra: {
      ...session,
      connectionTimeoutMillis: pool?.acquireTimeoutMillis ?? DEFAULT_CONNECT_TIMEOUT_MS,
      ...(pool?.enabled
        ? { min: pool.min, max: pool.max, idleTimeoutMillis: pool.idleTimeoutMillis }
        : {})
    }
  }
}
