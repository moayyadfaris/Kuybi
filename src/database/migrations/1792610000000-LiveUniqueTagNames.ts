import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Tag names are unique among live tags only (a deleted tag kept its name taken, so
 * creating a tag with it failed with a unique violation), and a tag no longer goes with
 * the user who created it: deleting a user deleted every tag they had created, and with
 * it those tags' links to stories.
 */
export class LiveUniqueTagNames1792610000000 implements MigrationInterface {
  name = 'LiveUniqueTagNames1792610000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tags" DROP CONSTRAINT "UQ_d90243459a697eadb8ad56e9092"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_TAGS_NAME_LIVE" ON "tags" ("name") WHERE "deletedAt" IS NULL`
    )
    await queryRunner.query(`ALTER TABLE "tags" DROP CONSTRAINT "FK_e968d9e7a21b2d9cd9244e79f48"`)
    await queryRunner.query(`ALTER TABLE "tags" ALTER COLUMN "createdBy" DROP NOT NULL`)
    await queryRunner.query(
      `ALTER TABLE "tags" ADD CONSTRAINT "FK_e968d9e7a21b2d9cd9244e79f48" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    )
  }

  /** Fails while a live and a deleted tag share a name, or a tag has no creator */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tags" DROP CONSTRAINT "FK_e968d9e7a21b2d9cd9244e79f48"`)
    await queryRunner.query(`ALTER TABLE "tags" ALTER COLUMN "createdBy" SET NOT NULL`)
    await queryRunner.query(
      `ALTER TABLE "tags" ADD CONSTRAINT "FK_e968d9e7a21b2d9cd9244e79f48" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    )
    await queryRunner.query(`DROP INDEX "public"."UQ_TAGS_NAME_LIVE"`)
    await queryRunner.query(
      `ALTER TABLE "tags" ADD CONSTRAINT "UQ_d90243459a697eadb8ad56e9092" UNIQUE ("name")`
    )
  }
}
