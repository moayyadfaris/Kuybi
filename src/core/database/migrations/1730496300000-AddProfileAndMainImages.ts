import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm'

export class AddProfileAndMainImages1730496300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add profileImageId to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'profileImageId',
        type: 'uuid',
        isNullable: true
      })
    )

    // Add foreign key for users.profileImageId -> attachments.id
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'FK_users_profileImage',
        columnNames: ['profileImageId'],
        referencedTableName: 'attachments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Add mainImageId to stories table
    await queryRunner.addColumn(
      'stories',
      new TableColumn({
        name: 'mainImageId',
        type: 'uuid',
        isNullable: true
      })
    )

    // Add foreign key for stories.mainImageId -> attachments.id
    await queryRunner.createForeignKey(
      'stories',
      new TableForeignKey({
        name: 'FK_stories_mainImage',
        columnNames: ['mainImageId'],
        referencedTableName: 'attachments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.dropForeignKey('users', 'FK_users_profileImage')
    await queryRunner.dropForeignKey('stories', 'FK_stories_mainImage')

    // Drop columns
    await queryRunner.dropColumn('users', 'profileImageId')
    await queryRunner.dropColumn('stories', 'mainImageId')
  }
}
