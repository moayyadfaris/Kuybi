import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIdempotencyKeys1792331083691 implements MigrationInterface {
  name = 'AddIdempotencyKeys1792331083691'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "scope" character varying(300) NOT NULL, "key" character varying(255) NOT NULL, "requestHash" character varying(64) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'in_progress', "responseStatus" integer, "responseBody" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_8ad20779ad0411107a56e53d0f6" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_idempotency_keys_expires_at" ON "idempotency_keys" ("expiresAt") `
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_idempotency_keys_scope_key" ON "idempotency_keys" ("scope", "key") `
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_idempotency_keys_scope_key"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_idempotency_keys_expires_at"`)
    await queryRunner.query(`DROP TABLE "idempotency_keys"`)
  }
}
