import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

/**
 * Migration: Create junction tables for post_content relationships
 *
 * Creates three many-to-many junction tables:
 * 1. post_content_attachments - Multiple files/images per content
 * 2. post_content_tags - Tag taxonomy relationships
 * 3. post_content_categories - Category taxonomy relationships
 *
 * Design Philosophy:
 * - Separate junction tables for clean many-to-many relationships
 * - Display ordering for attachments (gallery order)
 * - Cascade deletes when parent content deleted
 * - Unique constraints prevent duplicates
 * - Bi-directional indexes for fast queries
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
export class CreateJunctionTables1732000400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========== TABLE 1: post_content_attachments ==========
    // Links content to multiple attachments (images, files, videos)
    // Use case: Product with multiple images, Event with documents
    await queryRunner.createTable(
      new Table({
        name: 'post_content_attachments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          {
            name: 'postContentId',
            type: 'uuid',
            isNullable: false,
            comment: 'Reference to post_content'
          },
          {
            name: 'attachmentId',
            type: 'uuid',
            isNullable: false,
            comment: 'Reference to attachments table'
          },
          {
            name: 'displayOrder',
            type: 'integer',
            default: 0,
            comment: 'Order in gallery/list (0=first)'
          },
          {
            name: 'caption',
            type: 'text',
            isNullable: true,
            comment: 'Optional caption for this attachment'
          },
          {
            name: 'isPrimary',
            type: 'boolean',
            default: false,
            comment: 'Is this the primary/main attachment?'
          },
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'",
            comment: 'Additional metadata (alt text, crop settings, etc.)'
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Foreign keys
    await queryRunner.createForeignKey(
      'post_content_attachments',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_ATTACHMENTS_CONTENT',
        columnNames: ['postContentId'],
        referencedTableName: 'post_content',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE' // Delete associations when content deleted
      })
    )

    await queryRunner.createForeignKey(
      'post_content_attachments',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_ATTACHMENTS_ATTACHMENT',
        columnNames: ['attachmentId'],
        referencedTableName: 'attachments',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE' // Delete associations when attachment deleted
      })
    )

    // Unique constraint: same attachment cannot be added twice to same content
    await queryRunner.createIndex(
      'post_content_attachments',
      new TableIndex({
        name: 'IDX_POST_CONTENT_ATTACHMENTS_UNIQUE',
        columnNames: ['postContentId', 'attachmentId'],
        isUnique: true
      })
    )

    // Indexes for queries
    await queryRunner.createIndex(
      'post_content_attachments',
      new TableIndex({
        name: 'IDX_POST_CONTENT_ATTACHMENTS_CONTENT',
        columnNames: ['postContentId']
      })
    )

    await queryRunner.createIndex(
      'post_content_attachments',
      new TableIndex({
        name: 'IDX_POST_CONTENT_ATTACHMENTS_ATTACHMENT',
        columnNames: ['attachmentId']
      })
    )

    // Composite index for ordered queries
    await queryRunner.createIndex(
      'post_content_attachments',
      new TableIndex({
        name: 'IDX_POST_CONTENT_ATTACHMENTS_ORDER',
        columnNames: ['postContentId', 'displayOrder']
      })
    )

    // GIN index for metadata JSONB
    await queryRunner.query(`
      CREATE INDEX "IDX_POST_CONTENT_ATTACHMENTS_METADATA" 
      ON post_content_attachments USING GIN(metadata)
    `)

    // ========== TABLE 2: post_content_tags ==========
    // Links content to tags (many-to-many)
    // Use case: Event tagged with "conference", "tech", "2025"
    await queryRunner.createTable(
      new Table({
        name: 'post_content_tags',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          {
            name: 'postContentId',
            type: 'uuid',
            isNullable: false,
            comment: 'Reference to post_content'
          },
          {
            name: 'tagId',
            type: 'integer',
            isNullable: false,
            comment: 'Reference to tags table (tags use integer IDs)'
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Foreign keys
    await queryRunner.createForeignKey(
      'post_content_tags',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_TAGS_CONTENT',
        columnNames: ['postContentId'],
        referencedTableName: 'post_content',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE' // Delete associations when content deleted
      })
    )

    await queryRunner.createForeignKey(
      'post_content_tags',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_TAGS_TAG',
        columnNames: ['tagId'],
        referencedTableName: 'tags',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE' // Delete associations when tag deleted
      })
    )

    // Unique constraint: same tag cannot be added twice to same content
    await queryRunner.createIndex(
      'post_content_tags',
      new TableIndex({
        name: 'IDX_POST_CONTENT_TAGS_UNIQUE',
        columnNames: ['postContentId', 'tagId'],
        isUnique: true
      })
    )

    // Indexes for bi-directional queries
    await queryRunner.createIndex(
      'post_content_tags',
      new TableIndex({
        name: 'IDX_POST_CONTENT_TAGS_CONTENT',
        columnNames: ['postContentId']
      })
    )

    await queryRunner.createIndex(
      'post_content_tags',
      new TableIndex({
        name: 'IDX_POST_CONTENT_TAGS_TAG',
        columnNames: ['tagId']
      })
    )

    // ========== TABLE 3: post_content_categories ==========
    // Links content to categories (many-to-many)
    // Use case: Product in both "Electronics" and "Sale Items" categories
    await queryRunner.createTable(
      new Table({
        name: 'post_content_categories',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          {
            name: 'postContentId',
            type: 'uuid',
            isNullable: false,
            comment: 'Reference to post_content'
          },
          {
            name: 'categoryId',
            type: 'uuid',
            isNullable: false,
            comment: 'Reference to categories table'
          },
          {
            name: 'isPrimary',
            type: 'boolean',
            default: false,
            comment: 'Is this the primary category for this content?'
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          }
        ]
      }),
      true
    )

    // Foreign keys
    await queryRunner.createForeignKey(
      'post_content_categories',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_CATEGORIES_CONTENT',
        columnNames: ['postContentId'],
        referencedTableName: 'post_content',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE' // Delete associations when content deleted
      })
    )

    await queryRunner.createForeignKey(
      'post_content_categories',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_CATEGORIES_CATEGORY',
        columnNames: ['categoryId'],
        referencedTableName: 'categories',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE' // Delete associations when category deleted
      })
    )

    // Unique constraint: same category cannot be added twice to same content
    await queryRunner.createIndex(
      'post_content_categories',
      new TableIndex({
        name: 'IDX_POST_CONTENT_CATEGORIES_UNIQUE',
        columnNames: ['postContentId', 'categoryId'],
        isUnique: true
      })
    )

    // Indexes for bi-directional queries
    await queryRunner.createIndex(
      'post_content_categories',
      new TableIndex({
        name: 'IDX_POST_CONTENT_CATEGORIES_CONTENT',
        columnNames: ['postContentId']
      })
    )

    await queryRunner.createIndex(
      'post_content_categories',
      new TableIndex({
        name: 'IDX_POST_CONTENT_CATEGORIES_CATEGORY',
        columnNames: ['categoryId']
      })
    )

    // Index for finding primary category
    await queryRunner.createIndex(
      'post_content_categories',
      new TableIndex({
        name: 'IDX_POST_CONTENT_CATEGORIES_PRIMARY',
        columnNames: ['postContentId', 'isPrimary']
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ========== Drop post_content_categories ==========
    await queryRunner.dropIndex('post_content_categories', 'IDX_POST_CONTENT_CATEGORIES_PRIMARY')
    await queryRunner.dropIndex('post_content_categories', 'IDX_POST_CONTENT_CATEGORIES_CATEGORY')
    await queryRunner.dropIndex('post_content_categories', 'IDX_POST_CONTENT_CATEGORIES_CONTENT')
    await queryRunner.dropIndex('post_content_categories', 'IDX_POST_CONTENT_CATEGORIES_UNIQUE')
    await queryRunner.dropForeignKey(
      'post_content_categories',
      'FK_POST_CONTENT_CATEGORIES_CATEGORY'
    )
    await queryRunner.dropForeignKey(
      'post_content_categories',
      'FK_POST_CONTENT_CATEGORIES_CONTENT'
    )
    await queryRunner.dropTable('post_content_categories')

    // ========== Drop post_content_tags ==========
    await queryRunner.dropIndex('post_content_tags', 'IDX_POST_CONTENT_TAGS_TAG')
    await queryRunner.dropIndex('post_content_tags', 'IDX_POST_CONTENT_TAGS_CONTENT')
    await queryRunner.dropIndex('post_content_tags', 'IDX_POST_CONTENT_TAGS_UNIQUE')
    await queryRunner.dropForeignKey('post_content_tags', 'FK_POST_CONTENT_TAGS_TAG')
    await queryRunner.dropForeignKey('post_content_tags', 'FK_POST_CONTENT_TAGS_CONTENT')
    await queryRunner.dropTable('post_content_tags')

    // ========== Drop post_content_attachments ==========
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_POST_CONTENT_ATTACHMENTS_METADATA"`)
    await queryRunner.dropIndex('post_content_attachments', 'IDX_POST_CONTENT_ATTACHMENTS_ORDER')
    await queryRunner.dropIndex(
      'post_content_attachments',
      'IDX_POST_CONTENT_ATTACHMENTS_ATTACHMENT'
    )
    await queryRunner.dropIndex('post_content_attachments', 'IDX_POST_CONTENT_ATTACHMENTS_CONTENT')
    await queryRunner.dropIndex('post_content_attachments', 'IDX_POST_CONTENT_ATTACHMENTS_UNIQUE')
    await queryRunner.dropForeignKey(
      'post_content_attachments',
      'FK_POST_CONTENT_ATTACHMENTS_ATTACHMENT'
    )
    await queryRunner.dropForeignKey(
      'post_content_attachments',
      'FK_POST_CONTENT_ATTACHMENTS_CONTENT'
    )
    await queryRunner.dropTable('post_content_attachments')
  }
}
