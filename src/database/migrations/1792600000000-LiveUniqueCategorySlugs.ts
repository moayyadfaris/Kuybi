import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Category slugs are unique among live categories only. Soft-deleted categories kept
 * their slug taken, so creating a category with the slug of a deleted one failed with a
 * unique violation (500).
 */
export class LiveUniqueCategorySlugs1792600000000 implements MigrationInterface {
  name = 'LiveUniqueCategorySlugs1792600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09"`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_CATEGORIES_SLUG_LIVE" ON "categories" ("slug") WHERE "deletedAt" IS NULL`
    )
  }

  /** Fails while a live and a deleted category share a slug */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_CATEGORIES_SLUG_LIVE"`)
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE ("slug")`
    )
  }
}
