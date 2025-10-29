import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class CreatePermissionsTable1712001200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create action enum type
    await queryRunner.query(`
      CREATE TYPE permission_action_enum AS ENUM (
        'manage', 'create', 'read', 'update', 'delete',
        'restore', 'export', 'import', 'publish', 'archive',
        'moderate', 'assign'
      )
    `)

    // Create subject enum type
    await queryRunner.query(`
      CREATE TYPE permission_subject_enum AS ENUM (
        'all', 'User', 'Story', 'Attachment', 'Category',
        'Tag', 'Session', 'Role', 'Permission', 'Country', 'Setting'
      )
    `)

    await queryRunner.createTable(
      new Table({
        name: 'permissions',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment'
          },
          {
            name: 'action',
            type: 'permission_action_enum',
            isNullable: false
          },
          {
            name: 'subject',
            type: 'permission_subject_enum',
            isNullable: false
          },
          {
            name: 'conditions',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'fields',
            type: 'text',
            isNullable: true
          },
          {
            name: 'inverted',
            type: 'boolean',
            default: false
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true
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
      }),
      true
    )

    // Create indexes
    await queryRunner.createIndex(
      'permissions',
      new TableIndex({
        name: 'IDX_PERMISSIONS_ACTION',
        columnNames: ['action']
      })
    )

    await queryRunner.createIndex(
      'permissions',
      new TableIndex({
        name: 'IDX_PERMISSIONS_SUBJECT',
        columnNames: ['subject']
      })
    )

    await queryRunner.createIndex(
      'permissions',
      new TableIndex({
        name: 'IDX_PERMISSIONS_ACTION_SUBJECT',
        columnNames: ['action', 'subject']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('permissions', 'IDX_PERMISSIONS_ACTION_SUBJECT')
    await queryRunner.dropIndex('permissions', 'IDX_PERMISSIONS_SUBJECT')
    await queryRunner.dropIndex('permissions', 'IDX_PERMISSIONS_ACTION')
    await queryRunner.dropTable('permissions')
    await queryRunner.query('DROP TYPE permission_subject_enum')
    await queryRunner.query('DROP TYPE permission_action_enum')
  }
}
