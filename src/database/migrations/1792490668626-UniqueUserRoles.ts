import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A role is assigned to a user once: (userId, roleId) becomes unique, so two concurrent
 * assignments cannot both insert. Duplicates, if any, are removed first (keeping the
 * oldest). The unique index also serves lookups by user, so the plain userId index goes.
 * Also corrects the lockReason column comment (SECURITY_VIOLATION is not a lock reason).
 */
export class UniqueUserRoles1792490668626 implements MigrationInterface {
  name = 'UniqueUserRoles1792490668626'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "user_roles" a USING "user_roles" b
        WHERE a."userId" = b."userId" AND a."roleId" = b."roleId" AND a."id" > b."id"`
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_USER_ROLES_USER_ROLE" ON "user_roles" ("userId", "roleId")`
    )
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_USER_ROLES_USER"`)
    await queryRunner.query(
      `COMMENT ON COLUMN "users"."lockReason" IS 'Reason for account lock: FAILED_ATTEMPTS or ADMIN_LOCK (or a reason given by an admin)'`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON COLUMN "users"."lockReason" IS 'Reason for account lock: FAILED_ATTEMPTS, ADMIN_LOCK, SECURITY_VIOLATION'`
    )
    await queryRunner.query(`CREATE INDEX "IDX_USER_ROLES_USER" ON "user_roles" ("userId")`)
    await queryRunner.query(`DROP INDEX "public"."UQ_USER_ROLES_USER_ROLE"`)
  }
}
