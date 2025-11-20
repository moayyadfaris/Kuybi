import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddMissingPermissionSubjects1732100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add missing subject enum values
    await queryRunner.query(`
      ALTER TYPE permission_subject_enum ADD VALUE IF NOT EXISTS 'StoryVersion'
    `)

    await queryRunner.query(`
      ALTER TYPE permission_subject_enum ADD VALUE IF NOT EXISTS 'AuditLog'
    `)

    await queryRunner.query(`
      ALTER TYPE permission_subject_enum ADD VALUE IF NOT EXISTS 'PostType'
    `)

    await queryRunner.query(`
      ALTER TYPE permission_subject_enum ADD VALUE IF NOT EXISTS 'FieldDefinition'
    `)

    await queryRunner.query(`
      ALTER TYPE permission_subject_enum ADD VALUE IF NOT EXISTS 'Content'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL does not support removing enum values directly
    // This would require recreating the enum type, which is complex
    // For now, we'll leave the values in place as they don't cause issues
    console.log('Note: Enum values cannot be removed in PostgreSQL. Skipping rollback.')
  }
}
