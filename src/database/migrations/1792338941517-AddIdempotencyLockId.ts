import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIdempotencyLockId1792338941517 implements MigrationInterface {
  name = 'AddIdempotencyLockId1792338941517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ADD "lockId" uuid NOT NULL DEFAULT uuid_generate_v4()`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "idempotency_keys" DROP COLUMN "lockId"`)
  }
}
