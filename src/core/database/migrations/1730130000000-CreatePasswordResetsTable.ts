import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm'

export class CreatePasswordResetsTable1730130000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create password_resets table
    await queryRunner.createTable(
      new Table({
        name: 'password_resets',
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
            name: 'used',
            type: 'boolean',
            default: false
          },
          {
            name: 'usedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'requestIpAddress',
            type: 'varchar',
            length: '45',
            isNullable: true
          },
          {
            name: 'resetIpAddress',
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

    // Create indexes for efficient lookups
    await queryRunner.createIndex(
      'password_resets',
      new TableIndex({
        name: 'IDX_password_resets_email',
        columnNames: ['email']
      })
    )

    await queryRunner.createIndex(
      'password_resets',
      new TableIndex({
        name: 'IDX_password_resets_token',
        columnNames: ['token'],
        isUnique: true
      })
    )

    await queryRunner.createIndex(
      'password_resets',
      new TableIndex({
        name: 'IDX_password_resets_userId',
        columnNames: ['userId']
      })
    )

    // Composite index for finding active reset tokens for a user
    await queryRunner.createIndex(
      'password_resets',
      new TableIndex({
        name: 'IDX_password_resets_userId_used',
        columnNames: ['userId', 'used']
      })
    )

    // Index for cleanup of expired tokens
    await queryRunner.createIndex(
      'password_resets',
      new TableIndex({
        name: 'IDX_password_resets_expiresAt',
        columnNames: ['expiresAt']
      })
    )

    // Create foreign key to users table
    await queryRunner.createForeignKey(
      'password_resets',
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
    const table = await queryRunner.getTable('password_resets')
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('userId') !== -1)
    if (foreignKey) {
      await queryRunner.dropForeignKey('password_resets', foreignKey)
    }

    // Drop indexes
    await queryRunner.dropIndex('password_resets', 'IDX_password_resets_expiresAt')
    await queryRunner.dropIndex('password_resets', 'IDX_password_resets_userId_used')
    await queryRunner.dropIndex('password_resets', 'IDX_password_resets_userId')
    await queryRunner.dropIndex('password_resets', 'IDX_password_resets_token')
    await queryRunner.dropIndex('password_resets', 'IDX_password_resets_email')

    // Drop table
    await queryRunner.dropTable('password_resets')
  }
}
