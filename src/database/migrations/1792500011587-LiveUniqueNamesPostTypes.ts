import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Post type names and slugs, field names (per post type) and content slugs (per post
 * type) are unique among live rows only. Soft-deleted rows kept them taken, so creating a
 * post type, field or entry with the name of a deleted one failed with a unique violation.
 */
export class LiveUniqueNamesPostTypes1792500011587 implements MigrationInterface {
  name = 'LiveUniqueNamesPostTypes1792500011587'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "post_types" DROP CONSTRAINT "UQ_1c3d8778f5e1dc7d2cd095b7cba"`
    )
    await queryRunner.query(
      `ALTER TABLE "post_types" DROP CONSTRAINT "UQ_75d63e7c66f9f41eebbd2c91418"`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_POST_TYPES_NAME_LIVE" ON "post_types" ("name") WHERE "deletedAt" IS NULL`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_POST_TYPES_SLUG_LIVE" ON "post_types" ("slug") WHERE "deletedAt" IS NULL`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE" ON "field_definitions" ("postTypeId", "name") WHERE "deletedAt" IS NULL`
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE" ON "post_content" ("postTypeId", "slug") WHERE "deletedAt" IS NULL`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE" ON "post_content" ("postTypeId", "slug") `
    )
    await queryRunner.query(`DROP INDEX "public"."IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE"`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE" ON "field_definitions" ("postTypeId", "name") `
    )
    await queryRunner.query(`DROP INDEX "public"."UQ_POST_TYPES_SLUG_LIVE"`)
    await queryRunner.query(`DROP INDEX "public"."UQ_POST_TYPES_NAME_LIVE"`)
    await queryRunner.query(
      `ALTER TABLE "post_types" ADD CONSTRAINT "UQ_75d63e7c66f9f41eebbd2c91418" UNIQUE ("slug")`
    )
    await queryRunner.query(
      `ALTER TABLE "post_types" ADD CONSTRAINT "UQ_1c3d8778f5e1dc7d2cd095b7cba" UNIQUE ("name")`
    )
  }
}
