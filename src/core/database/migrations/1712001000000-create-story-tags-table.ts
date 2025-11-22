import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateStoryTagsTable1712001000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create story_tags junction table
    await queryRunner.createTable(
      new Table({
        name: 'story_tags',
        columns: [
          {
            name: 'storyId',
            type: 'integer',
            isPrimary: true
          },
          {
            name: 'tagId',
            type: 'integer',
            isPrimary: true
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

    // Create foreign key for storyId
    await queryRunner.createForeignKey(
      'story_tags',
      new TableForeignKey({
        name: 'FK_STORY_TAGS_STORY',
        columnNames: ['storyId'],
        referencedTableName: 'stories',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    // Create foreign key for tagId
    await queryRunner.createForeignKey(
      'story_tags',
      new TableForeignKey({
        name: 'FK_STORY_TAGS_TAG',
        columnNames: ['tagId'],
        referencedTableName: 'tags',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    // Create index for reverse lookups
    await queryRunner.createIndex(
      'story_tags',
      new TableIndex({
        name: 'IDX_STORY_TAGS_TAG_ID',
        columnNames: ['tagId']
      })
    )

    // Create index for created date
    await queryRunner.createIndex(
      'story_tags',
      new TableIndex({
        name: 'IDX_STORY_TAGS_CREATED_AT',
        columnNames: ['createdAt']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('story_tags', 'IDX_STORY_TAGS_CREATED_AT')
    await queryRunner.dropIndex('story_tags', 'IDX_STORY_TAGS_TAG_ID')

    // Drop foreign keys
    await queryRunner.dropForeignKey('story_tags', 'FK_STORY_TAGS_TAG')
    await queryRunner.dropForeignKey('story_tags', 'FK_STORY_TAGS_STORY')

    // Drop table
    await queryRunner.dropTable('story_tags')
  }
}
