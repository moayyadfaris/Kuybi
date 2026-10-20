import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Indexes for the queries the API actually runs, and no duplicates.
 *
 * Adds: story lists on live rows (newest first, per status, per author: the visibility
 * filter of ADR 0010 ORs the last two), story children and main image, attachment lists,
 * duplicate detection and stale-upload cleanup, both sides of user_roles and
 * role_permissions (a permission is granted to a role once), the latest version of a
 * story branch, and the foreign keys checked when attachments or versions are deleted.
 *
 * Drops 21 indexes that duplicated another index or a unique constraint on the same
 * columns (entity decorators declared them twice), which only slowed writes.
 *
 * Runs outside a transaction so indexes build and drop CONCURRENTLY, without blocking
 * writes. IF [NOT] EXISTS makes a re-run after a partial failure safe; an index left
 * INVALID by a failed concurrent build must be dropped by hand before re-running.
 */
export class IndexHotQueriesDropDuplicates1792474951363 implements MigrationInterface {
  name = 'IndexHotQueriesDropDuplicates1792474951363'
  transaction = false as const

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Keep one row per (roleId, permissionId) before the unique index
    await queryRunner.query(
      `DELETE FROM "role_permissions" a USING "role_permissions" b
        WHERE a."roleId" = b."roleId" AND a."permissionId" = b."permissionId" AND a."id" > b."id"`
    )
    for (const sql of [
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ATTACHMENTS_STATUS_CREATED" ON "attachments" ("securityStatus", "createdAt")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ATTACHMENTS_USER_CHECKSUM" ON "attachments" ("userId", "checksum")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ATTACHMENTS_USER_CREATED" ON "attachments" ("userId", "createdAt")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_USERS_PROFILE_IMAGE" ON "users" ("profileImageId")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_USER_ROLES_ROLE" ON "user_roles" ("roleId")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_USER_ROLES_USER" ON "user_roles" ("userId")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ROLE_PERMISSIONS_PERMISSION" ON "role_permissions" ("permissionId")`,
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "UQ_ROLE_PERMISSIONS_ROLE_PERMISSION" ON "role_permissions" ("roleId", "permissionId")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_STORIES_MAIN_IMAGE" ON "stories" ("mainImageId")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_STORIES_PARENT" ON "stories" ("parentId")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_STORIES_USER_CREATED" ON "stories" ("userId", "createdAt") WHERE "deletedAt" IS NULL`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_STORIES_STATUS_CREATED" ON "stories" ("status", "createdAt") WHERE "deletedAt" IS NULL`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_STORIES_LIVE_CREATED" ON "stories" ("createdAt") WHERE "deletedAt" IS NULL`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_STORY_VERSIONS_MERGED_FROM" ON "story_versions" ("mergedFromVersionId")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_STORY_VERSIONS_PARENT" ON "story_versions" ("parentVersionId")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_STORY_VERSIONS_BRANCH_NUMBER" ON "story_versions" ("storyId", "branchName", "versionNumber")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_POST_CONTENT_FEATURED_IMAGE" ON "post_content" ("featuredImageId")`
    ]) {
      await queryRunner.query(sql)
    }
    for (const name of [
      'IDX_0510701467ba81c2c005fc1325',
      'IDX_1c3d8778f5e1dc7d2cd095b7cb',
      'IDX_309feda1c7f531de4f99a8e8af',
      'IDX_310ad55add16c920cb6c4aee37',
      'IDX_31981c5f2d14b6e8cb82622d92',
      'IDX_4d6ef3e0b48f62c4b76e34b809',
      'IDX_595be4c36e66b21d3fd14c73a2',
      'IDX_6db611d752599d9120e78c520f',
      'IDX_75d63e7c66f9f41eebbd2c9141',
      'IDX_7816963aeec9d405f1d19a9fd1',
      'IDX_7b4cc18f5aafdcb7b8945d4a14',
      'IDX_7bda11923fd2a01796be308561',
      'IDX_7e0bf390a5906494b60f8cc51a',
      'IDX_984953bbbe4377be966c20b1a3',
      'IDX_98e354e640213d7eaa7ce7409b',
      'IDX_9b34edd5264effbbc875c266a9',
      'IDX_9cc5bb721511e6a048eb3ef0ed',
      'IDX_POST_TYPES_NAME',
      'IDX_POST_TYPES_SLUG',
      'IDX_f642ef8eb89ccfde9ced9fba09',
      'IDX_fbf508f49eb2ac412d10a50619'
    ]) {
      await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "public"."${name}"`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const sql of [
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_0510701467ba81c2c005fc1325" ON field_definitions ("deletedAt")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_1c3d8778f5e1dc7d2cd095b7cb" ON post_types (name)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_309feda1c7f531de4f99a8e8af" ON post_content ("deletedAt")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_310ad55add16c920cb6c4aee37" ON post_content (status)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_31981c5f2d14b6e8cb82622d92" ON post_types ("isSystem")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_4d6ef3e0b48f62c4b76e34b809" ON post_content ("isFeatured")`,
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "IDX_595be4c36e66b21d3fd14c73a2" ON email_verifications (token)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_6db611d752599d9120e78c520f" ON post_content ("isPinned")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_75d63e7c66f9f41eebbd2c9141" ON post_types (slug)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_7816963aeec9d405f1d19a9fd1" ON post_content (slug)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_7b4cc18f5aafdcb7b8945d4a14" ON field_definitions (name)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_7bda11923fd2a01796be308561" ON post_types ("deletedAt")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_7e0bf390a5906494b60f8cc51a" ON post_content ("publishedAt")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_984953bbbe4377be966c20b1a3" ON field_definitions ("isRequired")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_98e354e640213d7eaa7ce7409b" ON post_content ("hierarchyPath")`,
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "IDX_9b34edd5264effbbc875c266a9" ON password_resets (token)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_9cc5bb721511e6a048eb3ef0ed" ON post_types ("isActive")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_POST_TYPES_NAME" ON post_types (name)`,
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "IDX_POST_TYPES_SLUG" ON post_types (slug)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_f642ef8eb89ccfde9ced9fba09" ON post_content ("scheduledAt")`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_fbf508f49eb2ac412d10a50619" ON field_definitions ("fieldType")`
    ]) {
      await queryRunner.query(sql)
    }
    for (const name of [
      'IDX_ATTACHMENTS_STATUS_CREATED',
      'IDX_ATTACHMENTS_USER_CHECKSUM',
      'IDX_ATTACHMENTS_USER_CREATED',
      'IDX_USERS_PROFILE_IMAGE',
      'IDX_USER_ROLES_ROLE',
      'IDX_USER_ROLES_USER',
      'IDX_ROLE_PERMISSIONS_PERMISSION',
      'UQ_ROLE_PERMISSIONS_ROLE_PERMISSION',
      'IDX_STORIES_MAIN_IMAGE',
      'IDX_STORIES_PARENT',
      'IDX_STORIES_USER_CREATED',
      'IDX_STORIES_STATUS_CREATED',
      'IDX_STORIES_LIVE_CREATED',
      'IDX_STORY_VERSIONS_MERGED_FROM',
      'IDX_STORY_VERSIONS_PARENT',
      'IDX_STORY_VERSIONS_BRANCH_NUMBER',
      'IDX_POST_CONTENT_FEATURED_IMAGE'
    ]) {
      await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "public"."${name}"`)
    }
  }
}
