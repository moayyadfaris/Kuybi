import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIdempotencyLease1792337950007 implements MigrationInterface {
  name = 'AddIdempotencyLease1792337950007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ADD "lockedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "idempotency_keys" DROP COLUMN "lockedAt"`)
  }
}
