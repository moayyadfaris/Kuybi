import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

/**
 * Migration: Create post_content table
 *
 * This is the CORE table that stores actual content instances.
 * Each row is an instance of a post type (e.g., a specific Event, Product, or Recipe).
 *
 * CRITICAL: field_data JSONB column stores all custom field values
 * Example field_data structure:
 * {
 *   "event_date": "2025-06-15",
 *   "location": "New York",
 *   "price": 49.99,
 *   "max_attendees": 100,
 *   "custom_field_xyz": "value"
 * }
 *
 * Key Features:
 * - Dynamic content storage via field_data JSONB
 * - Full publishing workflow (draft → review → published → archived)
 * - Hierarchical support (parent-child relationships)
 * - SEO metadata
 * - Engagement metrics (views, likes)
 * - Multi-device attachment support
 * - Full-text search on title + excerpt
 * - Scheduled publishing
 * - Full audit trail
 *
 * Performance Targets:
 * - GIN index on field_data for <100ms queries
 * - Full-text search index for content search
 * - Composite indexes for common query patterns
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
export class CreatePostContentTable1732000300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'post_content',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },

          // Relationship to Post Type Definition
          {
            name: 'postTypeId',
            type: 'uuid',
            isNullable: false,
            comment: 'Post type this content belongs to (Event, Product, etc.)'
          },

          // Basic Content Information
          {
            name: 'title',
            type: 'varchar',
            length: '300',
            isNullable: false,
            comment: 'Content title (e.g., "Annual Tech Conference 2025")'
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '320',
            isNullable: false,
            comment: 'URL-friendly slug (unique per post type)'
          },
          {
            name: 'excerpt',
            type: 'text',
            isNullable: true,
            comment: 'Short description/summary (for listings, previews)'
          },

          // *** CRITICAL: Custom Field Data Storage ***
          // This JSONB column holds ALL custom field values for this content
          // Structure: { "field_name": "value", "field_name2": "value2", ... }
          // GIN index enables fast queries like: WHERE field_data @> '{"location": "New York"}'
          {
            name: 'fieldData',
            type: 'jsonb',
            default: "'{}'",
            isNullable: false,
            comment: 'ALL custom field values stored as JSONB (core of dynamic system)'
          },

          // Featured Image
          {
            name: 'featuredImageId',
            type: 'uuid',
            isNullable: true,
            comment: 'Primary featured image attachment'
          },

          // Publishing Workflow
          {
            name: 'status',
            type: 'content_status_enum',
            default: "'draft'",
            isNullable: false,
            comment: 'Publishing status (draft, published, archived, etc.)'
          },
          {
            name: 'authorId',
            type: 'uuid',
            isNullable: false,
            comment: 'Content author (creator)'
          },
          {
            name: 'publishedAt',
            type: 'timestamptz',
            isNullable: true,
            comment: 'When content was published (NULL if not published yet)'
          },
          {
            name: 'scheduledAt',
            type: 'timestamptz',
            isNullable: true,
            comment: 'Scheduled publish time (for status=scheduled)'
          },

          // Hierarchical Support (for post types with isHierarchical=true)
          {
            name: 'parentId',
            type: 'uuid',
            isNullable: true,
            comment: 'Parent content ID (for hierarchical post types like pages)'
          },
          {
            name: 'hierarchyLevel',
            type: 'integer',
            default: 0,
            comment: 'Depth in hierarchy (0=root, 1=child, 2=grandchild, etc.)'
          },
          {
            name: 'hierarchyPath',
            type: 'varchar',
            length: '500',
            isNullable: true,
            comment: 'Full path of IDs from root (e.g., "uuid1/uuid2/uuid3")'
          },
          {
            name: 'displayOrder',
            type: 'integer',
            default: 0,
            comment: 'Order within siblings (for hierarchical or manual ordering)'
          },

          // SEO Metadata
          {
            name: 'metaTitle',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'SEO page title (defaults to title if NULL)'
          },
          {
            name: 'metaDescription',
            type: 'varchar',
            length: '300',
            isNullable: true,
            comment: 'SEO meta description'
          },
          {
            name: 'metaKeywords',
            type: 'text',
            isNullable: true,
            comment: 'SEO keywords (comma-separated)'
          },

          // Engagement Metrics
          {
            name: 'viewCount',
            type: 'integer',
            default: 0,
            comment: 'Number of times content was viewed'
          },
          {
            name: 'likeCount',
            type: 'integer',
            default: 0,
            comment: 'Number of likes/favorites'
          },
          {
            name: 'commentCount',
            type: 'integer',
            default: 0,
            comment: 'Number of comments (if post type supports comments)'
          },

          // Visibility & Features
          {
            name: 'isFeatured',
            type: 'boolean',
            default: false,
            comment: 'Is this featured content? (for homepage, highlights)'
          },
          {
            name: 'isPinned',
            type: 'boolean',
            default: false,
            comment: 'Pinned to top of lists?'
          },
          {
            name: 'allowComments',
            type: 'boolean',
            default: true,
            comment: 'Allow comments on this content?'
          },

          // Additional Metadata
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'",
            comment: 'Additional custom metadata not in field definitions'
          },

          // Audit Trail
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: true,
            comment: 'User who created this content'
          },
          {
            name: 'updatedBy',
            type: 'uuid',
            isNullable: true,
            comment: 'User who last updated this content'
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false
          },
          {
            name: 'deletedAt',
            type: 'timestamptz',
            isNullable: true,
            comment: 'Soft delete timestamp'
          },

          // Optimistic Locking
          {
            name: 'version',
            type: 'integer',
            default: 1,
            isNullable: false,
            comment: 'Version number for optimistic locking'
          }
        ]
      }),
      true
    )

    // ========== FOREIGN KEYS ==========

    // FK to post_types (RESTRICT - cannot delete post type if content exists)
    await queryRunner.createForeignKey(
      'post_content',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_POST_TYPE',
        columnNames: ['postTypeId'],
        referencedTableName: 'post_types',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT' // Protect post types that have content
      })
    )

    // FK to users (author)
    await queryRunner.createForeignKey(
      'post_content',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_AUTHOR',
        columnNames: ['authorId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT' // Protect user accounts with content
      })
    )

    // FK to attachments (featured image)
    await queryRunner.createForeignKey(
      'post_content',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_FEATURED_IMAGE',
        columnNames: ['featuredImageId'],
        referencedTableName: 'attachments',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL' // Remove reference if attachment deleted
      })
    )

    // FK to self (parent-child hierarchy)
    await queryRunner.createForeignKey(
      'post_content',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_PARENT',
        columnNames: ['parentId'],
        referencedTableName: 'post_content',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL' // Remove parent link if parent deleted
      })
    )

    // FK to users (audit trail)
    await queryRunner.createForeignKey(
      'post_content',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_CREATED_BY',
        columnNames: ['createdBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    await queryRunner.createForeignKey(
      'post_content',
      new TableForeignKey({
        name: 'FK_POST_CONTENT_UPDATED_BY',
        columnNames: ['updatedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // ========== STANDARD INDEXES ==========

    // Unique slug per post type
    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE',
        columnNames: ['postTypeId', 'slug'],
        isUnique: true
      })
    )

    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_POST_TYPE',
        columnNames: ['postTypeId']
      })
    )

    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_STATUS',
        columnNames: ['status']
      })
    )

    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_AUTHOR',
        columnNames: ['authorId']
      })
    )

    // Composite index for common queries (get published content by type)
    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_TYPE_STATUS',
        columnNames: ['postTypeId', 'status']
      })
    )

    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_PUBLISHED_AT',
        columnNames: ['publishedAt']
      })
    )

    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_SCHEDULED_AT',
        columnNames: ['scheduledAt']
      })
    )

    // Hierarchical indexes
    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_PARENT',
        columnNames: ['parentId']
      })
    )

    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_HIERARCHY_PATH',
        columnNames: ['hierarchyPath']
      })
    )

    // Featured/pinned content
    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_FEATURED',
        columnNames: ['isFeatured']
      })
    )

    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_PINNED',
        columnNames: ['isPinned']
      })
    )

    await queryRunner.createIndex(
      'post_content',
      new TableIndex({
        name: 'IDX_POST_CONTENT_DELETED_AT',
        columnNames: ['deletedAt']
      })
    )

    // ========== CRITICAL: GIN INDEX ON field_data JSONB ==========
    // This is THE MOST IMPORTANT index for query performance
    // Enables fast queries like: WHERE field_data @> '{"location": "New York"}'
    // Without this, queries on custom fields would be slow table scans
    await queryRunner.query(`
      CREATE INDEX "IDX_POST_CONTENT_FIELD_DATA" 
      ON post_content USING GIN("fieldData")
    `)

    // GIN index on metadata JSONB
    await queryRunner.query(`
      CREATE INDEX "IDX_POST_CONTENT_METADATA" 
      ON post_content USING GIN(metadata)
    `)

    // ========== FULL-TEXT SEARCH INDEX ==========
    // Enable fast full-text search on title + excerpt
    // Uses PostgreSQL's built-in full-text search (tsvector)
    await queryRunner.query(`
      CREATE INDEX "IDX_POST_CONTENT_FULLTEXT" 
      ON post_content 
      USING GIN(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(excerpt, '')))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop full-text search index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_POST_CONTENT_FULLTEXT"`)

    // Drop GIN indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_POST_CONTENT_METADATA"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_POST_CONTENT_FIELD_DATA"`)

    // Drop regular indexes
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_DELETED_AT')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_PINNED')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_FEATURED')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_HIERARCHY_PATH')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_PARENT')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_SCHEDULED_AT')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_PUBLISHED_AT')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_TYPE_STATUS')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_AUTHOR')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_STATUS')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_POST_TYPE')
    await queryRunner.dropIndex('post_content', 'IDX_POST_CONTENT_SLUG_POST_TYPE_UNIQUE')

    // Drop foreign keys
    await queryRunner.dropForeignKey('post_content', 'FK_POST_CONTENT_UPDATED_BY')
    await queryRunner.dropForeignKey('post_content', 'FK_POST_CONTENT_CREATED_BY')
    await queryRunner.dropForeignKey('post_content', 'FK_POST_CONTENT_PARENT')
    await queryRunner.dropForeignKey('post_content', 'FK_POST_CONTENT_FEATURED_IMAGE')
    await queryRunner.dropForeignKey('post_content', 'FK_POST_CONTENT_AUTHOR')
    await queryRunner.dropForeignKey('post_content', 'FK_POST_CONTENT_POST_TYPE')

    // Drop table
    await queryRunner.dropTable('post_content')
  }
}
