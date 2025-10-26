import { MigrationInterface, QueryRunner, Table } from 'typeorm'

export class CreateUsersTable1712000100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'name',
            type: 'varchar',
            length: '50',
            isNullable: false
          },
          {
            name: 'email',
            type: 'varchar',
            length: '50',
            isNullable: false,
            isUnique: true
          },
          {
            name: 'mobileNumber',
            type: 'varchar',
            length: '50',
            isNullable: false,
            isUnique: true
          },
          {
            name: 'passwordHash',
            type: 'text',
            isNullable: false
          },
          {
            name: 'role',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: `'ROLE_USER'`
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true
          },
          {
            name: 'isVerified',
            type: 'boolean',
            default: false
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users')
  }
}
