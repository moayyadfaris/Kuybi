import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

export class CreateRolePermissionsTable1712001300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'role_permissions',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'roleId',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'permissionId',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    )

    // Create foreign keys
    await queryRunner.createForeignKey(
      'role_permissions',
      new TableForeignKey({
        name: 'FK_ROLE_PERMISSIONS_ROLE',
        columnNames: ['roleId'],
        referencedTableName: 'roles',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    )

    await queryRunner.createForeignKey(
      'role_permissions',
      new TableForeignKey({
        name: 'FK_ROLE_PERMISSIONS_PERMISSION',
        columnNames: ['permissionId'],
        referencedTableName: 'permissions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    )

    // Create unique constraint to prevent duplicate assignments
    await queryRunner.createIndex(
      'role_permissions',
      new TableIndex({
        name: 'IDX_ROLE_PERMISSIONS_UNIQUE',
        columnNames: ['roleId', 'permissionId'],
        isUnique: true,
      })
    )

    // Create index for reverse lookups
    await queryRunner.createIndex(
      'role_permissions',
      new TableIndex({
        name: 'IDX_ROLE_PERMISSIONS_PERMISSION',
        columnNames: ['permissionId'],
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('role_permissions', 'IDX_ROLE_PERMISSIONS_PERMISSION')
    await queryRunner.dropIndex('role_permissions', 'IDX_ROLE_PERMISSIONS_UNIQUE')
    await queryRunner.dropForeignKey('role_permissions', 'FK_ROLE_PERMISSIONS_PERMISSION')
    await queryRunner.dropForeignKey('role_permissions', 'FK_ROLE_PERMISSIONS_ROLE')
    await queryRunner.dropTable('role_permissions')
  }
}
