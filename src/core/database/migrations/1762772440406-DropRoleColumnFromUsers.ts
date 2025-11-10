import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

/**
 * Drop deprecated role column from users table
 *
 * The role column is redundant now that we have:
 * - primary_role_id (FK to roles table)
 * - primaryRole relation (eager loaded)
 * - user_roles table (many-to-many with advanced features)
 *
 * All code has been migrated to use user.getPrimaryRoleName() instead of user.role
 */
export class DropRoleColumnFromUsers1762772440406 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the deprecated role column
    await queryRunner.dropColumn('users', 'role')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the role column for rollback
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'role',
        type: 'varchar',
        length: '20',
        default: "'ROLE_USER'",
        comment: 'Deprecated - use primaryRole relation instead'
      })
    )

    // Sync role column with primaryRole.name for existing users
    await queryRunner.query(`
      UPDATE users u
      SET role = COALESCE(r.name, 'ROLE_USER')
      FROM roles r
      WHERE u.primary_role_id = r.id
    `)
  }
}
