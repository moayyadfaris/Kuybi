import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm'

export class CreateAttachmentsTable1712000400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'attachments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'path',
            type: 'varchar',
            length: '1024',
            isNullable: false
          },
          {
            name: 'mimeType',
            type: 'varchar',
            length: '150',
            isNullable: false
          },
          {
            name: 'size',
            type: 'integer',
            isNullable: false
          },
          {
            name: 'originalName',
            type: 'varchar',
            length: '255',
            isNullable: false
          },
          {
            name: 'category',
            type: 'varchar',
            length: '50',
            isNullable: true
          },
          {
            name: 'isPublic',
            type: 'boolean',
            default: false
          },
          {
            name: 'isEncrypted',
            type: 'boolean',
            default: false
          },
          {
            name: 'encryptionKey',
            type: 'varchar',
            length: '255',
            isNullable: true
          },
          {
            name: 'securityStatus',
            type: 'varchar',
            length: '20',
            default: `'pending'`
          },
          {
            name: 'checksum',
            type: 'varchar',
            length: '128',
            isNullable: true
          },
          {
            name: 'downloadCount',
            type: 'integer',
            default: 0
          },
          {
            name: 'lastAccessedAt',
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'folder',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true
          },
          {
            name: 'tags',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'scanResults',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'containsPII',
            type: 'boolean',
            default: false
          },
          {
            name: 'retentionPeriod',
            type: 'varchar',
            length: '20',
            isNullable: true
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'deletionScheduledAt',
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'thumbnailPath',
            type: 'varchar',
            length: '1024',
            isNullable: true
          },
          {
            name: 'version',
            type: 'integer',
            default: 1
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'deletedAt',
            type: 'timestamptz',
            isNullable: true
          }
        ]
      })
    )

    await queryRunner.createForeignKey(
      'attachments',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.query('CREATE INDEX idx_attachments_user ON attachments ("userId")')
    await queryRunner.query(
      'CREATE INDEX idx_attachments_security_status ON attachments ("securityStatus")'
    )
    await queryRunner.query('CREATE INDEX idx_attachments_is_public ON attachments ("isPublic")')
    await queryRunner.query('CREATE INDEX idx_attachments_folder ON attachments (folder)')
    await queryRunner.query('CREATE INDEX idx_attachments_deleted_at ON attachments ("deletedAt")')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_attachments_deleted_at')
    await queryRunner.query('DROP INDEX IF EXISTS idx_attachments_folder')
    await queryRunner.query('DROP INDEX IF EXISTS idx_attachments_is_public')
    await queryRunner.query('DROP INDEX IF EXISTS idx_attachments_security_status')
    await queryRunner.query('DROP INDEX IF EXISTS idx_attachments_user')
    await queryRunner.dropTable('attachments', true)
  }
}
