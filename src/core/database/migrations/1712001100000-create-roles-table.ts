import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class CreateRolesTable1712001100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment'
          },
          {
            name: 'name',
            type: 'varchar',
            length: '50',
            isUnique: true,
            isNullable: false
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true
          },
          {
            name: 'isSystem',
            type: 'boolean',
            default: false
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true
          },
          {
            name: 'priority',
            type: 'integer',
            default: 50
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
          },
          {
            name: 'deletedAt',
            type: 'timestamptz',
            isNullable: true
          }
        ]
      }),
      true
    )

    // Create indexes
    await queryRunner.createIndex(
      'roles',
      new TableIndex({
        name: 'IDX_ROLES_NAME',
        columnNames: ['name']
      })
    )

    await queryRunner.createIndex(
      'roles',
      new TableIndex({
        name: 'IDX_ROLES_IS_ACTIVE',
        columnNames: ['isActive']
      })
    )

    await queryRunner.createIndex(
      'roles',
      new TableIndex({
        name: 'IDX_ROLES_DELETED_AT',
        columnNames: ['deletedAt']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('roles', 'IDX_ROLES_DELETED_AT')
    await queryRunner.dropIndex('roles', 'IDX_ROLES_IS_ACTIVE')
    await queryRunner.dropIndex('roles', 'IDX_ROLES_NAME')
    await queryRunner.dropTable('roles')
  }
}
