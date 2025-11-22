import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

/**
 * Story Version System Migration
 *
 * Creates the story_versions table for complete version control of stories.
 * Provides Git-like functionality with:
 * - Complete content snapshots at each version
 * - Parent version tracking for history chain
 * - Branch/merge support
 * - Rollback capabilities
 * - Change diff tracking
 * - Content hash for deduplication
 *
 * Performance Considerations:
 * - Indexed on storyId + versionNumber for fast version lookup
 * - Indexed on storyId + createdAt for chronological queries
 * - Branch and tag indexes for filtering
 * - Content hash for duplicate detection
 */
export class CreateStoryVersionsTable1730496500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ENUM types
    await queryRunner.query(`
      CREATE TYPE version_type_enum AS ENUM (
        'MANUAL',
        'AUTO', 
        'BRANCH',
        'MERGE',
        'ROLLBACK'
      )
    `)

    await queryRunner.query(`
      CREATE TYPE version_status_enum AS ENUM (
        'ACTIVE',
        'ARCHIVED',
        'DRAFT',
        'DELETED'
      )
    `)

    // Create story_versions table
    await queryRunner.createTable(
      new Table({
        name: 'story_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          // Story reference
          {
            name: 'storyId',
            type: 'int',
            isNullable: false
          },
          // Version metadata
          {
            name: 'versionNumber',
            type: 'int',
            isNullable: false,
            comment: 'Sequential version number'
          },
          {
            name: 'versionLabel',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Optional label like v1.0, beta-1'
          },
          {
            name: 'versionType',
            type: 'version_type_enum',
            default: "'AUTO'"
          },
          {
            name: 'status',
            type: 'version_status_enum',
            default: "'ARCHIVED'"
          },
          // Complete content snapshot
          {
            name: 'title',
            type: 'varchar',
            length: '200',
            isNullable: false
          },
          {
            name: 'details',
            type: 'text',
            isNullable: true
          },
          {
            name: 'type',
            type: 'varchar',
            length: '50',
            isNullable: false
          },
          {
            name: 'storyStatus',
            type: 'varchar',
            length: '50',
            isNullable: false
          },
          {
            name: 'priority',
            type: 'varchar',
            length: '50',
            isNullable: false
          },
          {
            name: 'fromTime',
            type: 'timestamptz',
            isNullable: true
          },
          {
            name: 'toTime',
            type: 'timestamptz',
            isNullable: true
          },
          // Location data
          {
            name: 'latitude',
            type: 'decimal',
            precision: 10,
            scale: 8,
            isNullable: true
          },
          {
            name: 'longitude',
            type: 'decimal',
            precision: 11,
            scale: 8,
            isNullable: true
          },
          {
            name: 'address',
            type: 'varchar',
            length: '255',
            isNullable: true
          },
          {
            name: 'city',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'region',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'countryId',
            type: 'int',
            isNullable: true
          },
          // Metadata snapshot
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'"
          },
          {
            name: 'internalNotes',
            type: 'text',
            isNullable: true
          },
          // Relations snapshots (IDs only)
          {
            name: 'tagIds',
            type: 'jsonb',
            isNullable: true,
            comment: 'Snapshot of tag IDs at this version'
          },
          {
            name: 'categoryIds',
            type: 'jsonb',
            isNullable: true,
            comment: 'Snapshot of category IDs at this version'
          },
          {
            name: 'attachmentIds',
            type: 'jsonb',
            isNullable: true,
            comment: 'Snapshot of attachment IDs at this version'
          },
          {
            name: 'mainImageId',
            type: 'uuid',
            isNullable: true
          },
          // Version chain tracking
          {
            name: 'parentVersionId',
            type: 'uuid',
            isNullable: true,
            comment: 'Previous version in chain'
          },
          // Branch/merge support
          {
            name: 'branchName',
            type: 'varchar',
            length: '100',
            default: "'main'"
          },
          {
            name: 'tag',
            type: 'varchar',
            length: '100',
            isNullable: true
          },
          {
            name: 'mergedFromVersionId',
            type: 'uuid',
            isNullable: true,
            comment: 'Source version if this is a merge'
          },
          // Change tracking
          {
            name: 'changes',
            type: 'jsonb',
            isNullable: true,
            comment: 'Diff from previous version'
          },
          {
            name: 'changeSummary',
            type: 'text',
            isNullable: true,
            comment: 'Human-readable change description'
          },
          {
            name: 'changesCount',
            type: 'int',
            default: 0
          },
          // Content hash for deduplication
          {
            name: 'contentHash',
            type: 'varchar',
            length: '64',
            isNullable: true,
            comment: 'SHA-256 of content'
          },
          // Author & timestamps
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'commitMessage',
            type: 'text',
            isNullable: true
          },
          // Rollback tracking
          {
            name: 'isRollback',
            type: 'boolean',
            default: false
          },
          {
            name: 'rolledBackFromVersionId',
            type: 'uuid',
            isNullable: true
          },
          // Retention
          {
            name: 'isPinned',
            type: 'boolean',
            default: false,
            comment: 'Pinned versions are never auto-deleted'
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
            isNullable: true,
            comment: 'Optional expiration for auto-cleanup'
          }
        ]
      }),
      true
    )

    // Create indexes for performance
    await queryRunner.createIndex(
      'story_versions',
      new TableIndex({
        name: 'IDX_story_versions_storyId_versionNumber',
        columnNames: ['storyId', 'versionNumber']
      })
    )

    await queryRunner.createIndex(
      'story_versions',
      new TableIndex({
        name: 'IDX_story_versions_storyId_createdAt',
        columnNames: ['storyId', 'createdAt']
      })
    )

    await queryRunner.createIndex(
      'story_versions',
      new TableIndex({
        name: 'IDX_story_versions_branchName',
        columnNames: ['branchName']
      })
    )

    await queryRunner.createIndex(
      'story_versions',
      new TableIndex({
        name: 'IDX_story_versions_tag',
        columnNames: ['tag']
      })
    )

    await queryRunner.createIndex(
      'story_versions',
      new TableIndex({
        name: 'IDX_story_versions_createdBy',
        columnNames: ['createdBy']
      })
    )

    await queryRunner.createIndex(
      'story_versions',
      new TableIndex({
        name: 'IDX_story_versions_contentHash',
        columnNames: ['contentHash']
      })
    )

    await queryRunner.createIndex(
      'story_versions',
      new TableIndex({
        name: 'IDX_story_versions_status',
        columnNames: ['status']
      })
    )

    // Foreign keys
    await queryRunner.createForeignKey(
      'story_versions',
      new TableForeignKey({
        name: 'FK_story_versions_story',
        columnNames: ['storyId'],
        referencedTableName: 'stories',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    )

    await queryRunner.createForeignKey(
      'story_versions',
      new TableForeignKey({
        name: 'FK_story_versions_createdBy',
        columnNames: ['createdBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    await queryRunner.createForeignKey(
      'story_versions',
      new TableForeignKey({
        name: 'FK_story_versions_parentVersion',
        columnNames: ['parentVersionId'],
        referencedTableName: 'story_versions',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    await queryRunner.createForeignKey(
      'story_versions',
      new TableForeignKey({
        name: 'FK_story_versions_mergedFromVersion',
        columnNames: ['mergedFromVersionId'],
        referencedTableName: 'story_versions',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    console.log('✅ Created story_versions table with complete version control support')
    console.log('   - Version chain tracking')
    console.log('   - Branch/merge capabilities')
    console.log('   - Content deduplication')
    console.log('   - Rollback support')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('story_versions')
    await queryRunner.query(`DROP TYPE IF EXISTS version_type_enum`)
    await queryRunner.query(`DROP TYPE IF EXISTS version_status_enum`)
  }
}
