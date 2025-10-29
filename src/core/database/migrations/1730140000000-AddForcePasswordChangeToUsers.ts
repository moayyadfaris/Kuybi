import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

/**
 * Migration: Add forcePasswordChange field to users table
 *
 * Purpose: Enable administrators to require users to change their password
 * on next login. Used for:
 * - Admin-initiated password resets
 * - Security incidents
 * - Expired temporary passwords
 * - Compliance requirements
 *
 * Field: forcePasswordChange (boolean, default: false)
 */
export class AddForcePasswordChangeToUsers1730140000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add forcePasswordChange column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'forcePasswordChange',
        type: 'boolean',
        default: false,
        comment: 'Requires user to change password on next login'
      })
    )

    console.log('✅ Added forcePasswordChange column to users table')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove forcePasswordChange column
    await queryRunner.dropColumn('users', 'forcePasswordChange')

    console.log('✅ Removed forcePasswordChange column from users table')
  }
}
