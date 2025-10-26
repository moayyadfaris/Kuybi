import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateStoryCategoriesTable1712001500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create story_categories junction table
    await queryRunner.createTable(
      new Table({
        name: 'story_categories',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'storyId',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'categoryId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: true,
          },
        ],
      }),
      true,
    )

    // Add foreign key constraints
    await queryRunner.createForeignKey(
      'story_categories',
      new TableForeignKey({
        columnNames: ['storyId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'stories',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    )

    await queryRunner.createForeignKey(
      'story_categories',
      new TableForeignKey({
        columnNames: ['categoryId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'categories',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    )

    // Add unique constraint to prevent duplicate assignments
    await queryRunner.createIndex(
      'story_categories',
      new TableIndex({
        name: 'idx_story_categories_unique',
        columnNames: ['storyId', 'categoryId'],
        isUnique: true,
      }),
    )

    // Add performance indexes
    await queryRunner.createIndex(
      'story_categories',
      new TableIndex({
        name: 'idx_story_categories_story',
        columnNames: ['storyId'],
      }),
    )

    await queryRunner.createIndex(
      'story_categories',
      new TableIndex({
        name: 'idx_story_categories_category',
        columnNames: ['categoryId'],
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('story_categories', 'idx_story_categories_category')
    await queryRunner.dropIndex('story_categories', 'idx_story_categories_story')
    await queryRunner.dropIndex('story_categories', 'idx_story_categories_unique')

    // Drop table (foreign keys are dropped automatically)
    await queryRunner.dropTable('story_categories')
  }
}
