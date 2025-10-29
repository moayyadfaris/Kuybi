/**
 * Test database utilities
 * Helpers for database setup, cleanup, and seeding
 */

import { DataSource } from 'typeorm'
import { testConfig } from '../test.config'

export class TestDatabase {
  private static dataSource: DataSource

  /**
   * Create a test database connection
   */
  static async createConnection(entities: any[]): Promise<DataSource> {
    if (this.dataSource?.isInitialized) {
      return this.dataSource
    }

    this.dataSource = new DataSource({
      type: 'postgres',
      host: testConfig.database.host,
      port: testConfig.database.port,
      username: testConfig.database.username,
      password: testConfig.database.password,
      database: testConfig.database.database,
      entities,
      synchronize: true,
      dropSchema: false,
      logging: false
    })

    await this.dataSource.initialize()
    return this.dataSource
  }

  /**
   * Close database connection
   */
  static async closeConnection(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy()
    }
  }

  /**
   * Clear all tables (keep schema)
   */
  static async clearDatabase(): Promise<void> {
    if (!this.dataSource?.isInitialized) {
      return
    }

    const entities = this.dataSource.entityMetadatas

    // Disable foreign key checks
    await this.dataSource.query('SET session_replication_role = replica;')

    // Truncate all tables
    for (const entity of entities) {
      const repository = this.dataSource.getRepository(entity.name)
      await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE;`)
    }

    // Re-enable foreign key checks
    await this.dataSource.query('SET session_replication_role = DEFAULT;')
  }

  /**
   * Run migrations
   */
  static async runMigrations(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.runMigrations()
    }
  }

  /**
   * Revert last migration
   */
  static async revertMigration(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.undoLastMigration()
    }
  }

  /**
   * Get repository for testing
   */
  static getRepository<Entity extends object>(entity: new () => Entity) {
    return this.dataSource.getRepository(entity)
  }
}
