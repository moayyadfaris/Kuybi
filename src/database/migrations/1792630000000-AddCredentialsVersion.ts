import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * users.credentialsVersion: raised by every password reset (by email or by an admin).
 * Access tokens (`cv` claim) and sessions record the version they were issued under and
 * are void once it moves on. Unlike the credentialsChangedAt time comparison, this also
 * voids tokens issued earlier in the same second as the reset.
 */
export class AddCredentialsVersion1792630000000 implements MigrationInterface {
  name = 'AddCredentialsVersion1792630000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "credentialsVersion" integer NOT NULL DEFAULT 0`
    )
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD "credentialsVersion" integer NOT NULL DEFAULT 0`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "credentialsVersion"`)
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "credentialsVersion"`)
  }
}
