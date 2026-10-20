import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Two schema fixes from the auth review.
 *
 * Password reset and email verification tokens are stored as SHA-256 hashes
 * ('sha256$' + hex, as hashTokenSecret writes them) instead of in clear: a database leak
 * must not hand out working reset links.
 *
 * Existing tokens are hashed in place, so links already emailed keep working. down()
 * cannot recover the tokens from their hashes: it deletes the rows (each token is a
 * single-use link valid for an hour or a day) before restoring the uuid column type.
 */
export class HashEmailedTokensOptionalPhone1792489150356 implements MigrationInterface {
  name = 'HashEmailedTokensOptionalPhone1792489150356'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Optional phone numbers: '' broke the unique constraint for the second user registering
    // without one (500). NULL is allowed any number of times.
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "mobileNumber" DROP NOT NULL`)
    await queryRunner.query(`UPDATE "users" SET "mobileNumber" = NULL WHERE "mobileNumber" = ''`)

    for (const table of ['password_resets', 'email_verifications']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "token" TYPE varchar(80)
           USING 'sha256$' || encode(sha256(convert_to("token"::text, 'UTF8')), 'hex')`
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unique per user, so the column can be NOT NULL again
    await queryRunner.query(
      `UPDATE "users" SET "mobileNumber" = 'unset:' || "id" WHERE "mobileNumber" IS NULL`
    )
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "mobileNumber" SET NOT NULL`)

    for (const table of ['password_resets', 'email_verifications']) {
      await queryRunner.query(`DELETE FROM "${table}"`)
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "token" TYPE uuid USING NULL`)
    }
  }
}
