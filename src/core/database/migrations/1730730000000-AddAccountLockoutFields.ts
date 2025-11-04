import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm'

export class AddAccountLockoutFields1730730000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add account lockout columns to users table
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'failedLoginAttempts',
        type: 'integer',
        default: 0,
        isNullable: false,
        comment: 'Number of consecutive failed login attempts'
      }),
      new TableColumn({
        name: 'isLocked',
        type: 'boolean',
        default: false,
        isNullable: false,
        comment: 'Whether the account is currently locked'
      }),
      new TableColumn({
        name: 'lockedAt',
        type: 'timestamptz',
        isNullable: true,
        comment: 'Timestamp when the account was locked'
      }),
      new TableColumn({
        name: 'lockedUntil',
        type: 'timestamptz',
        isNullable: true,
        comment: 'Timestamp when the account will be automatically unlocked'
      }),
      new TableColumn({
        name: 'lockReason',
        type: 'varchar',
        length: '100',
        isNullable: true,
        comment: 'Reason for account lock: FAILED_ATTEMPTS, ADMIN_LOCK, SECURITY_VIOLATION'
      })
    ])

    // Add indexes for efficient queries
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_USERS_IS_LOCKED',
        columnNames: ['isLocked']
      })
    )

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_USERS_LOCKED_UNTIL',
        columnNames: ['lockedUntil'],
        where: '"lockedUntil" IS NOT NULL'
      })
    )

    // Composite index for finding expired locks efficiently
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_USERS_LOCKED_STATUS',
        columnNames: ['isLocked', 'lockedUntil']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('users', 'IDX_USERS_LOCKED_STATUS')
    await queryRunner.dropIndex('users', 'IDX_USERS_LOCKED_UNTIL')
    await queryRunner.dropIndex('users', 'IDX_USERS_IS_LOCKED')

    // Drop columns
    await queryRunner.dropColumn('users', 'lockReason')
    await queryRunner.dropColumn('users', 'lockedUntil')
    await queryRunner.dropColumn('users', 'lockedAt')
    await queryRunner.dropColumn('users', 'isLocked')
    await queryRunner.dropColumn('users', 'failedLoginAttempts')
  }
}
