import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class CreateCategoriesTable1712000500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create categories table
    await queryRunner.createTable(
      new Table({
        name: 'categories',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'name',
            type: 'varchar',
            length: '120',
            isNullable: false
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '140',
            isNullable: false,
            isUnique: true
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            isNullable: true
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            isNullable: false
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            default: "'{}'"
          },
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'updatedBy',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'deletedBy',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'version',
            type: 'integer',
            default: 1,
            isNullable: false
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Create index on slug for fast lookups
    await queryRunner.createIndex(
      'categories',
      new TableIndex({
        name: 'IDX_CATEGORIES_SLUG',
        columnNames: ['slug']
      })
    )

    // Create index on isActive for filtering active categories
    await queryRunner.createIndex(
      'categories',
      new TableIndex({
        name: 'IDX_CATEGORIES_IS_ACTIVE',
        columnNames: ['isActive']
      })
    )

    // Create index on deletedAt for soft delete queries
    await queryRunner.createIndex(
      'categories',
      new TableIndex({
        name: 'IDX_CATEGORIES_DELETED_AT',
        columnNames: ['deletedAt']
      })
    )

    // Create composite index for common query pattern (active + not deleted)
    await queryRunner.createIndex(
      'categories',
      new TableIndex({
        name: 'IDX_CATEGORIES_ACTIVE_NOT_DELETED',
        columnNames: ['isActive', 'deletedAt']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('categories', 'IDX_CATEGORIES_ACTIVE_NOT_DELETED')
    await queryRunner.dropIndex('categories', 'IDX_CATEGORIES_DELETED_AT')
    await queryRunner.dropIndex('categories', 'IDX_CATEGORIES_IS_ACTIVE')
    await queryRunner.dropIndex('categories', 'IDX_CATEGORIES_SLUG')

    // Drop table
    await queryRunner.dropTable('categories')
  }
}
