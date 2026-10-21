import { config as loadEnv } from 'dotenv'
import * as path from 'path'
import { DataSource } from 'typeorm'

import configuration from '@core/config/configuration'

import { postgresOptions } from './postgres-options'

loadEnv()

const appConfig = configuration()

/** Migrations and scripts: the app's connection settings, migration session limits */
export const AppDataSource = new DataSource({
  ...postgresOptions(appConfig.database, 'migrations'),
  // Resolved next to this file, so it works from src (ts-node) and from dist (node)
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations'
})
