import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { DataSourceOptions } from 'typeorm'

import { ENTITIES } from './entities'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const database = configService.get('database')
        const poolConfig = database?.pool || {}

        const config: DataSourceOptions = {
          type: 'postgres',
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.name,
          entities: ENTITIES,
          synchronize: false,
          logging: database.logging,
          // Add connection pooling if enabled
          ...(poolConfig?.enabled
            ? {
                extra: {
                  min: poolConfig.min,
                  max: poolConfig.max,
                  idleTimeoutMillis: poolConfig.idleTimeoutMillis,
                  connectionTimeoutMillis: poolConfig.acquireTimeoutMillis
                }
              }
            : {})
        }

        return config
      }
    })
  ]
})
export class DatabaseModule {}
