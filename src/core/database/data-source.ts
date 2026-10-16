import { config as loadEnv } from 'dotenv'
import { DataSource } from 'typeorm'

import configuration from '../config/configuration'

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
  migrations: ['src/core/database/migrations/*.ts'],
  migrationsTableName: 'migrations'
})
