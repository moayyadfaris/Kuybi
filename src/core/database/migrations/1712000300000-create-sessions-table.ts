import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm'

export class CreateSessionsTable1712000300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sessions',
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
            name: 'refreshTokenHash',
            type: 'text',
            isNullable: false
          },
          {
            name: 'deviceType',
            type: 'varchar',
            length: '120',
            isNullable: true
          },
          {
            name: 'userAgent',
            type: 'text',
            isNullable: true
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true
          },
          {
            name: 'lastActivityAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
            isNullable: false
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      })
    )

    await queryRunner.createForeignKey(
      'sessions',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.query('CREATE INDEX idx_sessions_user ON sessions ("userId")')
    await queryRunner.query('CREATE INDEX idx_sessions_expires ON sessions ("expiresAt")')
    await queryRunner.query('CREATE INDEX idx_sessions_active ON sessions ("expiresAt", "userId")')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_sessions_active')
    await queryRunner.query('DROP INDEX IF EXISTS idx_sessions_expires')
    await queryRunner.query('DROP INDEX IF EXISTS idx_sessions_user')
    await queryRunner.dropTable('sessions', true)
  }
}
