import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateStoriesTable1712000700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create stories table
    await queryRunner.createTable(
      new Table({
        name: 'stories',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true
          },
          {
            name: 'title',
            type: 'varchar',
            length: '200',
            isNullable: false
          },
          {
            name: 'details',
            type: 'text',
            isNullable: true
          },
          {
            name: 'type',
            type: 'varchar',
            length: '50',
            default: "'STORY'",
            isNullable: false
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'DRAFT'",
            isNullable: false
          },
          {
            name: 'fromTime',
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'toTime',
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'priority',
            type: 'varchar',
            length: '20',
            default: "'NORMAL'",
            isNullable: false
          },
          {
            name: 'isInEditMode',
            type: 'boolean',
            default: false,
            isNullable: false
          },
          {
            name: 'parentId',
            type: 'integer',
            isNullable: true
          },
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'",
            isNullable: false
          },
          {
            name: 'internalNotes',
            type: 'text',
            isNullable: true
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
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'lastModifiedBy',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'version',
            type: 'integer',
            default: 1,
            isNullable: false
          },
          {
            name: 'latitude',
            type: 'decimal',
            precision: 10,
            scale: 8,
            isNullable: true
          },
          {
            name: 'longitude',
            type: 'decimal',
            precision: 11,
            scale: 8,
            isNullable: true
          },
          {
            name: 'address',
            type: 'varchar',
            length: '255',
            isNullable: true
          },
          {
            name: 'city',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'region',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'countryId',
            type: 'integer',
            isNullable: true
          },
          {
            name: 'deletionReason',
            type: 'varchar',
            length: '255',
            isNullable: true
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

    // Create foreign key for userId
    await queryRunner.createForeignKey(
      'stories',
      new TableForeignKey({
        name: 'FK_STORIES_USER',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Create self-referencing foreign key for parentId
    await queryRunner.createForeignKey(
      'stories',
      new TableForeignKey({
        name: 'FK_STORIES_PARENT',
        columnNames: ['parentId'],
        referencedTableName: 'stories',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Create indexes
    await queryRunner.createIndex(
      'stories',
      new TableIndex({
        name: 'IDX_STORIES_USER_ID',
        columnNames: ['userId']
      })
    )

    await queryRunner.createIndex(
      'stories',
      new TableIndex({
        name: 'IDX_STORIES_STATUS',
        columnNames: ['status']
      })
    )

    await queryRunner.createIndex(
      'stories',
      new TableIndex({
        name: 'IDX_STORIES_TYPE',
        columnNames: ['type']
      })
    )

    await queryRunner.createIndex(
      'stories',
      new TableIndex({
        name: 'IDX_STORIES_PRIORITY',
        columnNames: ['priority']
      })
    )

    await queryRunner.createIndex(
      'stories',
      new TableIndex({
        name: 'IDX_STORIES_PARENT_ID',
        columnNames: ['parentId']
      })
    )

    await queryRunner.createIndex(
      'stories',
      new TableIndex({
        name: 'IDX_STORIES_DELETED_AT',
        columnNames: ['deletedAt']
      })
    )

    await queryRunner.createIndex(
      'stories',
      new TableIndex({
        name: 'IDX_STORIES_CREATED_AT',
        columnNames: ['createdAt']
      })
    )

    // Composite index for common queries
    await queryRunner.createIndex(
      'stories',
      new TableIndex({
        name: 'IDX_STORIES_STATUS_TYPE_DELETED',
        columnNames: ['status', 'type', 'deletedAt']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('stories', 'IDX_STORIES_STATUS_TYPE_DELETED')
    await queryRunner.dropIndex('stories', 'IDX_STORIES_CREATED_AT')
    await queryRunner.dropIndex('stories', 'IDX_STORIES_DELETED_AT')
    await queryRunner.dropIndex('stories', 'IDX_STORIES_PARENT_ID')
    await queryRunner.dropIndex('stories', 'IDX_STORIES_PRIORITY')
    await queryRunner.dropIndex('stories', 'IDX_STORIES_TYPE')
    await queryRunner.dropIndex('stories', 'IDX_STORIES_STATUS')
    await queryRunner.dropIndex('stories', 'IDX_STORIES_USER_ID')

    // Drop foreign keys
    await queryRunner.dropForeignKey('stories', 'FK_STORIES_PARENT')
    await queryRunner.dropForeignKey('stories', 'FK_STORIES_USER')

    // Drop table
    await queryRunner.dropTable('stories')
  }
}
