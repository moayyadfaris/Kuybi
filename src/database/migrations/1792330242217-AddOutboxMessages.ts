import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddOutboxMessages1792330242217 implements MigrationInterface {
  name = 'AddOutboxMessages1792330242217'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "outbox_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "queue" character varying(100) NOT NULL, "jobName" character varying(100) NOT NULL, "payload" jsonb NOT NULL, "jobOptions" jsonb NOT NULL DEFAULT '{}', "status" character varying(20) NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "availableAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastError" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "dispatchedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_0171348f527c64b137e4d4f5b66" PRIMARY KEY ("id"))`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_messages_pending" ON "outbox_messages" ("availableAt") WHERE "status" = 'pending'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_outbox_messages_pending"`)
    await queryRunner.query(`DROP TABLE "outbox_messages"`)
  }
}
