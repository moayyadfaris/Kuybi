import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateUserRolesTable1712001400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment'
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'roleId',
            type: 'integer',
            isNullable: false
          },
          {
            name: 'assignedBy',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'assignedAt',
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    )

    // Create foreign keys
    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        name: 'FK_USER_ROLES_USER',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.createForeignKey(
      'user_roles',
      new TableForeignKey({
        name: 'FK_USER_ROLES_ROLE',
        columnNames: ['roleId'],
        referencedTableName: 'roles',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    // Create unique constraint to prevent duplicate role assignments
    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({
        name: 'IDX_USER_ROLES_UNIQUE',
        columnNames: ['userId', 'roleId'],
        isUnique: true
      })
    )

    // Create indexes for efficient queries
    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({
        name: 'IDX_USER_ROLES_USER',
        columnNames: ['userId']
      })
    )

    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({
        name: 'IDX_USER_ROLES_ROLE',
        columnNames: ['roleId']
      })
    )

    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({
        name: 'IDX_USER_ROLES_IS_ACTIVE',
        columnNames: ['isActive']
      })
    )

    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({
        name: 'IDX_USER_ROLES_EXPIRES_AT',
        columnNames: ['expiresAt']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('user_roles', 'IDX_USER_ROLES_EXPIRES_AT')
    await queryRunner.dropIndex('user_roles', 'IDX_USER_ROLES_IS_ACTIVE')
    await queryRunner.dropIndex('user_roles', 'IDX_USER_ROLES_ROLE')
    await queryRunner.dropIndex('user_roles', 'IDX_USER_ROLES_USER')
    await queryRunner.dropIndex('user_roles', 'IDX_USER_ROLES_UNIQUE')
    await queryRunner.dropForeignKey('user_roles', 'FK_USER_ROLES_ROLE')
    await queryRunner.dropForeignKey('user_roles', 'FK_USER_ROLES_USER')
    await queryRunner.dropTable('user_roles')
  }
}
