import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateTagsTable1712000800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tags table
    await queryRunner.createTable(
      new Table({
        name: 'tags',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true
          },
          {
            name: 'name',
            type: 'varchar',
            length: '200',
            isNullable: false,
            isUnique: true
          },
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: false
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
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'color',
            type: 'varchar',
            length: '7',
            isNullable: true
          },
          {
            name: 'sortOrder',
            type: 'integer',
            default: 0,
            isNullable: false
          },
          {
            name: 'isSystem',
            type: 'boolean',
            default: false,
            isNullable: false
          },
          {
            name: 'version',
            type: 'integer',
            default: 1,
            isNullable: false
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Create foreign key for createdBy
    await queryRunner.createForeignKey(
      'tags',
      new TableForeignKey({
        name: 'FK_TAGS_CREATED_BY',
        columnNames: ['createdBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    // Create foreign key for updatedBy
    await queryRunner.createForeignKey(
      'tags',
      new TableForeignKey({
        name: 'FK_TAGS_UPDATED_BY',
        columnNames: ['updatedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Create foreign key for deletedBy
    await queryRunner.createForeignKey(
      'tags',
      new TableForeignKey({
        name: 'FK_TAGS_DELETED_BY',
        columnNames: ['deletedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Create indexes
    await queryRunner.createIndex(
      'tags',
      new TableIndex({
        name: 'IDX_TAGS_NAME',
        columnNames: ['name']
      })
    )

    await queryRunner.createIndex(
      'tags',
      new TableIndex({
        name: 'IDX_TAGS_DELETED_AT',
        columnNames: ['deletedAt']
      })
    )

    await queryRunner.createIndex(
      'tags',
      new TableIndex({
        name: 'IDX_TAGS_CREATED_BY',
        columnNames: ['createdBy']
      })
    )

    await queryRunner.createIndex(
      'tags',
      new TableIndex({
        name: 'IDX_TAGS_IS_SYSTEM',
        columnNames: ['isSystem']
      })
    )

    await queryRunner.createIndex(
      'tags',
      new TableIndex({
        name: 'IDX_TAGS_SORT_ORDER',
        columnNames: ['sortOrder']
      })
    )

    // Composite index for active tags
    await queryRunner.createIndex(
      'tags',
      new TableIndex({
        name: 'IDX_TAGS_ACTIVE',
        columnNames: ['deletedAt', 'sortOrder']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('tags', 'IDX_TAGS_ACTIVE')
    await queryRunner.dropIndex('tags', 'IDX_TAGS_SORT_ORDER')
    await queryRunner.dropIndex('tags', 'IDX_TAGS_IS_SYSTEM')
    await queryRunner.dropIndex('tags', 'IDX_TAGS_CREATED_BY')
    await queryRunner.dropIndex('tags', 'IDX_TAGS_DELETED_AT')
    await queryRunner.dropIndex('tags', 'IDX_TAGS_NAME')

    // Drop foreign keys
    await queryRunner.dropForeignKey('tags', 'FK_TAGS_DELETED_BY')
    await queryRunner.dropForeignKey('tags', 'FK_TAGS_UPDATED_BY')
    await queryRunner.dropForeignKey('tags', 'FK_TAGS_CREATED_BY')

    // Drop table
    await queryRunner.dropTable('tags')
  }
}
