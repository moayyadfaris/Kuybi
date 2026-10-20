import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Drops the per-row retention columns of audit_logs: nothing set or read them (every row
 * said "keep forever"). Retention is now a setting applied by the daily purge job
 * (AUDIT_RETENTION_DAYS, AUDIT_CRITICAL_RETENTION_DAYS).
 */
export class DropAuditRetentionColumns1792590000000 implements MigrationInterface {
  name = 'DropAuditRetentionColumns1792590000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN "retentionDays", DROP COLUMN "isArchived", DROP COLUMN "archivedAt"`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD "retentionDays" integer NOT NULL DEFAULT '0', ADD "isArchived" boolean NOT NULL DEFAULT false, ADD "archivedAt" TIMESTAMP WITH TIME ZONE`
    )
  }
}
