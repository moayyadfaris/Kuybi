import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateStoryAttachmentsTable1712000900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create story_attachments junction table
    await queryRunner.createTable(
      new Table({
        name: 'story_attachments',
        columns: [
          {
            name: 'storyId',
            type: 'integer',
            isPrimary: true
          },
          {
            name: 'attachmentId',
            type: 'uuid',
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
      'story_attachments',
      new TableForeignKey({
        name: 'FK_STORY_ATTACHMENTS_STORY',
        columnNames: ['storyId'],
        referencedTableName: 'stories',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    // Create foreign key for attachmentId
    await queryRunner.createForeignKey(
      'story_attachments',
      new TableForeignKey({
        name: 'FK_STORY_ATTACHMENTS_ATTACHMENT',
        columnNames: ['attachmentId'],
        referencedTableName: 'attachments',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    // Create index for reverse lookups
    await queryRunner.createIndex(
      'story_attachments',
      new TableIndex({
        name: 'IDX_STORY_ATTACHMENTS_ATTACHMENT_ID',
        columnNames: ['attachmentId']
      })
    )

    // Create index for created date
    await queryRunner.createIndex(
      'story_attachments',
      new TableIndex({
        name: 'IDX_STORY_ATTACHMENTS_CREATED_AT',
        columnNames: ['createdAt']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('story_attachments', 'IDX_STORY_ATTACHMENTS_CREATED_AT')
    await queryRunner.dropIndex('story_attachments', 'IDX_STORY_ATTACHMENTS_ATTACHMENT_ID')

    // Drop foreign keys
    await queryRunner.dropForeignKey('story_attachments', 'FK_STORY_ATTACHMENTS_ATTACHMENT')
    await queryRunner.dropForeignKey('story_attachments', 'FK_STORY_ATTACHMENTS_STORY')

    // Drop table
    await queryRunner.dropTable('story_attachments')
  }
}
