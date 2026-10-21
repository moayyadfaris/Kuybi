import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * users.credentialsChangedAt: when the password was last reset (by email or by an admin).
 * Access tokens issued and sessions created before it are rejected, so a reset ends
 * earlier access even if revoking the sessions did not run.
 */
export class AddUserCredentialsChangedAt1792620000000 implements MigrationInterface {
  name = 'AddUserCredentialsChangedAt1792620000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "credentialsChangedAt" TIMESTAMP WITH TIME ZONE`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "credentialsChangedAt"`)
  }
}
