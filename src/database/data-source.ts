import { config as loadEnv } from 'dotenv'
import * as path from 'path'
import { DataSource } from 'typeorm'

import configuration from '@core/config/configuration'

import { ENTITIES } from './entities'

loadEnv()

const appConfig = configuration()

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: appConfig.database.host,
  port: appConfig.database.port,
  username: appConfig.database.username,
  password: appConfig.database.password,
  database: appConfig.database.name,
  entities: ENTITIES,
  // Resolved next to this file, so it works from src (ts-node) and from dist (node)
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations'
})
