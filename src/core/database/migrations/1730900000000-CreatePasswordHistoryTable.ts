import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreatePasswordHistoryTable1730900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create password_history table
    await queryRunner.createTable(
      new Table({
        name: 'password_history',
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
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'passwordHash',
            type: 'text',
            isNullable: false,
            comment: 'Bcrypt hashed password'
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
            comment: 'When this password was set'
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true,
            comment: 'IP address from which password was changed'
          },
          {
            name: 'userAgent',
            type: 'varchar',
            length: '255',
            isNullable: true,
            comment: 'User agent string'
          }
        ]
      }),
      true
    )

    // Create index for efficient user queries
    await queryRunner.createIndex(
      'password_history',
      new TableIndex({
        name: 'IDX_PASSWORD_HISTORY_USER_CREATED',
        columnNames: ['userId', 'createdAt']
      })
    )

    // Create foreign key to users table
    await queryRunner.createForeignKey(
      'password_history',
      new TableForeignKey({
        name: 'FK_PASSWORD_HISTORY_USER',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    await queryRunner.dropForeignKey('password_history', 'FK_PASSWORD_HISTORY_USER')

    // Drop index
    await queryRunner.dropIndex('password_history', 'IDX_PASSWORD_HISTORY_USER_CREATED')

    // Drop table
    await queryRunner.dropTable('password_history')
  }
}
