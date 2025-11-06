import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm'

export class AddPrimaryRoleToUsers1730900000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add primary_role_id column (nullable initially)
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'primary_role_id',
        type: 'integer',
        isNullable: true
      })
    )

    // Step 2: Add foreign key constraint
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'fk_users_primary_role',
        columnNames: ['primary_role_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'roles',
        onDelete: 'SET NULL'
      })
    )

    // Step 3: Migrate existing data - super-admin users
    await queryRunner.query(`
      UPDATE users 
      SET primary_role_id = (SELECT id FROM roles WHERE name = 'super-admin' LIMIT 1)
      WHERE role = 'super-admin'
    `)

    // Step 4: Migrate existing data - regular users (ROLE_USER or NULL)
    await queryRunner.query(`
      UPDATE users 
      SET primary_role_id = (SELECT id FROM roles WHERE name = 'user' LIMIT 1)
      WHERE role = 'ROLE_USER' OR role IS NULL OR role = '' OR primary_role_id IS NULL
    `)

    // Step 5: Ensure user_roles entries exist for all users
    await queryRunner.query(`
      INSERT INTO user_roles (user_id, role_id, is_active, expires_at, created_at, updated_at)
      SELECT u.id, u.primary_role_id, true, NULL, NOW(), NOW()
      FROM users u
      WHERE u.primary_role_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur 
          WHERE ur.user_id = u.id AND ur.role_id = u.primary_role_id
        )
    `)

    // Step 6: Make primary_role_id NOT NULL now that all users have a value
    await queryRunner.changeColumn(
      'users',
      'primary_role_id',
      new TableColumn({
        name: 'primary_role_id',
        type: 'integer',
        isNullable: false
      })
    )

    // Step 7: Add index for better query performance
    await queryRunner.query(`
      CREATE INDEX idx_users_primary_role_id ON users(primary_role_id)
    `)

    console.log('✅ Migration completed: primary_role_id added to users table')
    console.log('✅ Existing users migrated to ACL role system')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_primary_role_id`)

    // Drop foreign key
    await queryRunner.dropForeignKey('users', 'fk_users_primary_role')

    // Drop column
    await queryRunner.dropColumn('users', 'primary_role_id')

    console.log('✅ Migration reverted: primary_role_id removed from users table')
  }
}
