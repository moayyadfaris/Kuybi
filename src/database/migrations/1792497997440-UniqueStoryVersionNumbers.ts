import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A story's version numbers are unique: (storyId, versionNumber) becomes a unique index,
 * replacing the plain one. Versions that share a number (written concurrently before the
 * numbering lock) are renumbered first: the oldest keeps the number, the others go after
 * the story's highest number, oldest first. Down keeps the new numbers.
 */
export class UniqueStoryVersionNumbers1792497997440 implements MigrationInterface {
  name = 'UniqueStoryVersionNumbers1792497997440'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `WITH ranked AS (
         SELECT "id", "storyId", "createdAt",
                ROW_NUMBER() OVER (
                  PARTITION BY "storyId", "versionNumber" ORDER BY "createdAt", "id"
                ) AS "copy"
           FROM "story_versions"
       ),
       extra AS (
         SELECT "id", "storyId",
                ROW_NUMBER() OVER (PARTITION BY "storyId" ORDER BY "createdAt", "id") AS "k"
           FROM ranked
          WHERE "copy" > 1
       ),
       highest AS (
         SELECT "storyId", MAX("versionNumber") AS "top" FROM "story_versions" GROUP BY "storyId"
       )
       UPDATE "story_versions" v
          SET "versionNumber" = highest."top" + extra."k"
         FROM extra JOIN highest USING ("storyId")
        WHERE v."id" = extra."id"`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_STORY_VERSIONS_STORY_NUMBER" ON "story_versions" ("storyId", "versionNumber")`
    )
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_4617211fede67416fba44f51e2"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_4617211fede67416fba44f51e2" ON "story_versions" ("storyId", "versionNumber")`
    )
    await queryRunner.query(`DROP INDEX "public"."UQ_STORY_VERSIONS_STORY_NUMBER"`)
  }
}
