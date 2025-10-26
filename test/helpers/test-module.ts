/**
 * Test module utilities
 * Helpers for creating test modules with mocked dependencies
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { testConfig } from '../test.config';

/**
 * Create a test module with common dependencies
 */
export class TestModuleBuilder {
  /**
   * Create a basic test module with TypeORM and Config
   */
  static async createTestModule(
    imports: any[] = [],
    providers: any[] = [],
    controllers: any[] = [],
  ): Promise<TestingModule> {
    return await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => testConfig],
        }),
        ...imports,
      ],
      providers,
      controllers,
    }).compile();
  }

  /**
   * Create a test module with TypeORM
   */
  static async createWithDatabase(
    entities: any[],
    imports: any[] = [],
    providers: any[] = [],
    controllers: any[] = [],
  ): Promise<TestingModule> {
    return await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => testConfig],
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: testConfig.database.host,
          port: testConfig.database.port,
          username: testConfig.database.username,
          password: testConfig.database.password,
          database: testConfig.database.database,
          entities,
          synchronize: true,
          dropSchema: false,
          logging: false,
        }),
        TypeOrmModule.forFeature(entities),
        ...imports,
      ],
      providers,
      controllers,
    }).compile();
  }

  /**
   * Create a test module with Redis cache
   */
  static async createWithCache(
    imports: any[] = [],
    providers: any[] = [],
    controllers: any[] = [],
  ): Promise<TestingModule> {
    return await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => testConfig],
        }),
        CacheModule.register({
          isGlobal: true,
          ttl: 60,
        }),
        ...imports,
      ],
      providers,
      controllers,
    }).compile();
  }
}
