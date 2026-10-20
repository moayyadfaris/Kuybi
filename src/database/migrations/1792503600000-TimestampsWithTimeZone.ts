import { MigrationInterface, QueryRunner } from 'typeorm'

/** The last columns stored without a time zone (every other table uses timestamptz) */
const COLUMNS: Record<string, string[]> = {
  audit_logs: ['createdAt', 'archivedAt'],
  email_verifications: ['createdAt', 'updatedAt', 'expiresAt', 'verifiedAt'],
  password_resets: ['createdAt', 'updatedAt', 'expiresAt', 'usedAt']
}

/**
 * Converts them to timestamptz. Stored values are read in the session's time zone: the
 * column defaults (now()) wrote that zone's wall clock, and the app wrote its own zone's,
 * which is the same when the app and the database run in one zone (UTC in production).
 * Set the session zone (PGTZ) before running if they differed.
 */
export class TimestampsWithTimeZone1792503600000 implements MigrationInterface {
  name = 'TimestampsWithTimeZone1792503600000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.convert(queryRunner, 'timestamptz')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.convert(queryRunner, 'timestamp')
  }

  private async convert(queryRunner: QueryRunner, type: string): Promise<void> {
    for (const [table, columns] of Object.entries(COLUMNS)) {
      const changes = columns.map(
        column =>
          `ALTER COLUMN "${column}" TYPE ${type} USING "${column}" AT TIME ZONE current_setting('TimeZone')`
      )
      await queryRunner.query(`ALTER TABLE "${table}" ${changes.join(', ')}`)
    }
  }
}
