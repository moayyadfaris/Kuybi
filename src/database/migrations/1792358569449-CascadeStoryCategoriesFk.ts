import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * TypeORM 1.x gives the inverse side of a bidirectional many-to-many junction
 * ON DELETE/UPDATE CASCADE, like the owning side and like story_tags already had
 * (0.3 used NO ACTION). Hard-deleting a category linked to stories used to fail on
 * this constraint; now its junction rows go with it.
 */
export class CascadeStoryCategoriesFk1792358569449 implements MigrationInterface {
  name = 'CascadeStoryCategoriesFk1792358569449'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "story_categories" DROP CONSTRAINT "FK_e482c279e8b5b79d200ec56776f"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_categories" ADD CONSTRAINT "FK_e482c279e8b5b79d200ec56776f" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "story_categories" DROP CONSTRAINT "FK_e482c279e8b5b79d200ec56776f"`
    )
    await queryRunner.query(
      `ALTER TABLE "story_categories" ADD CONSTRAINT "FK_e482c279e8b5b79d200ec56776f" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    )
  }
}
