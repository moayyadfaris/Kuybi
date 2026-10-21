import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { DatabaseConfig, postgresOptions } from './postgres-options'

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        postgresOptions(configService.getOrThrow<DatabaseConfig>('database'))
    })
  ]
})
export class DatabaseModule {}
