import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  TableForeignKey
} from 'typeorm'

export class AddEmailVerification1730116103000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add email verification fields to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'isEmailVerified',
        type: 'boolean',
        default: false
      })
    )

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'emailVerifiedAt',
        type: 'timestamptz',
        isNullable: true
      })
    )

    // Create email_verifications table
    await queryRunner.createTable(
      new Table({
        name: 'email_verifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'userId',
            type: 'uuid'
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255'
          },
          {
            name: 'token',
            type: 'uuid',
            isUnique: true
          },
          {
            name: 'expiresAt',
            type: 'timestamp'
          },
          {
            name: 'verified',
            type: 'boolean',
            default: false
          },
          {
            name: 'verifiedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true
          },
          {
            name: 'userAgent',
            type: 'text',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()'
          }
        ]
      }),
      true
    )

    // Create indexes
    await queryRunner.createIndex(
      'email_verifications',
      new TableIndex({
        name: 'IDX_email_verifications_email',
        columnNames: ['email']
      })
    )

    await queryRunner.createIndex(
      'email_verifications',
      new TableIndex({
        name: 'IDX_email_verifications_token',
        columnNames: ['token'],
        isUnique: true
      })
    )

    await queryRunner.createIndex(
      'email_verifications',
      new TableIndex({
        name: 'IDX_email_verifications_userId',
        columnNames: ['userId']
      })
    )

    await queryRunner.createIndex(
      'email_verifications',
      new TableIndex({
        name: 'IDX_email_verifications_userId_verified',
        columnNames: ['userId', 'verified']
      })
    )

    await queryRunner.createIndex(
      'email_verifications',
      new TableIndex({
        name: 'IDX_email_verifications_expiresAt',
        columnNames: ['expiresAt']
      })
    )

    // Create foreign key
    await queryRunner.createForeignKey(
      'email_verifications',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE'
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    const table = await queryRunner.getTable('email_verifications')
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('userId') !== -1)
    if (foreignKey) {
      await queryRunner.dropForeignKey('email_verifications', foreignKey)
    }

    // Drop indexes
    await queryRunner.dropIndex('email_verifications', 'IDX_email_verifications_expiresAt')
    await queryRunner.dropIndex('email_verifications', 'IDX_email_verifications_userId_verified')
    await queryRunner.dropIndex('email_verifications', 'IDX_email_verifications_userId')
    await queryRunner.dropIndex('email_verifications', 'IDX_email_verifications_token')
    await queryRunner.dropIndex('email_verifications', 'IDX_email_verifications_email')

    // Drop table
    await queryRunner.dropTable('email_verifications')

    // Drop columns from users table
    await queryRunner.dropColumn('users', 'emailVerifiedAt')
    await queryRunner.dropColumn('users', 'isEmailVerified')
  }
}
