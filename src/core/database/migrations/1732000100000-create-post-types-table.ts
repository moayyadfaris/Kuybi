import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

/**
 * Migration: Create post_types table
 *
 * This table stores dynamic post type definitions (like WordPress custom post types).
 * Examples: Event, Product, Recipe, Article, Portfolio, etc.
 *
 * Key Features:
 * - JSONB settings for flexible configuration
 * - Hierarchical support (parent-child relationships)
 * - System protection (cannot delete system types like 'Story')
 * - Full audit trail with created_by/updated_by
 * - Soft delete support
 * - Optimistic locking with version field
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
export class CreatePostTypesTable1732000100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'post_types',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },

          // Basic Information
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
            comment: 'Display name (e.g., "Event", "Product")'
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '120',
            isUnique: true,
            isNullable: false,
            comment: 'URL-friendly identifier (e.g., "event", "product")'
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: 'Description of what this post type is for'
          },
          {
            name: 'icon',
            type: 'varchar',
            length: '50',
            isNullable: true,
            comment: 'Icon name for UI display (e.g., "calendar", "shopping-cart")'
          },

          // Display Labels
          {
            name: 'singularLabel',
            type: 'varchar',
            length: '100',
            isNullable: false,
            comment: 'Singular form (e.g., "Event")'
          },
          {
            name: 'pluralLabel',
            type: 'varchar',
            length: '100',
            isNullable: false,
            comment: 'Plural form (e.g., "Events")'
          },
          {
            name: 'menuIcon',
            type: 'varchar',
            length: '50',
            isNullable: true,
            comment: 'Menu icon identifier for navigation'
          },

          // Feature Flags
          {
            name: 'isHierarchical',
            type: 'boolean',
            default: false,
            comment: 'Supports parent-child relationships (like pages)'
          },
          {
            name: 'supportsComments',
            type: 'boolean',
            default: false,
            comment: 'Enable commenting system'
          },
          {
            name: 'supportsRevisions',
            type: 'boolean',
            default: true,
            comment: 'Enable version history'
          },
          {
            name: 'menuPosition',
            type: 'integer',
            default: 100,
            comment: 'Order in navigation menu (lower = higher priority)'
          },

          // Capabilities & ACL
          {
            name: 'capabilityType',
            type: 'varchar',
            length: '50',
            default: "'post'",
            comment: 'Base capability type for ACL integration'
          },

          // REST API Configuration
          {
            name: 'showInRest',
            type: 'boolean',
            default: true,
            comment: 'Expose in REST API'
          },
          {
            name: 'restBase',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Custom REST API base path'
          },

          // Status Flags
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
            comment: 'Is post type currently active'
          },
          {
            name: 'isSystem',
            type: 'boolean',
            default: false,
            comment: 'System post type (cannot be deleted, e.g., "Story")'
          },

          // Flexible Configuration (JSONB)
          {
            name: 'settings',
            type: 'jsonb',
            default: "'{}'",
            comment: 'Additional settings as JSON'
          },

          // Audit Trail
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: true,
            comment: 'User ID who created this post type'
          },
          {
            name: 'updatedBy',
            type: 'uuid',
            isNullable: true,
            comment: 'User ID who last updated this post type'
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
        ],
        foreignKeys: [
          {
            name: 'FK_POST_TYPES_CREATED_BY',
            columnNames: ['createdBy'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL'
          },
          {
            name: 'FK_POST_TYPES_UPDATED_BY',
            columnNames: ['updatedBy'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL'
          }
        ]
      }),
      true
    )

    // Create indexes for performance
    await queryRunner.createIndex(
      'post_types',
      new TableIndex({
        name: 'IDX_POST_TYPES_SLUG',
        columnNames: ['slug'],
        isUnique: true
      })
    )

    await queryRunner.createIndex(
      'post_types',
      new TableIndex({
        name: 'IDX_POST_TYPES_NAME',
        columnNames: ['name']
      })
    )

    await queryRunner.createIndex(
      'post_types',
      new TableIndex({
        name: 'IDX_POST_TYPES_ACTIVE',
        columnNames: ['isActive']
      })
    )

    await queryRunner.createIndex(
      'post_types',
      new TableIndex({
        name: 'IDX_POST_TYPES_SYSTEM',
        columnNames: ['isSystem']
      })
    )

    await queryRunner.createIndex(
      'post_types',
      new TableIndex({
        name: 'IDX_POST_TYPES_DELETED_AT',
        columnNames: ['deletedAt']
      })
    )

    // Create index on JSONB settings for fast queries
    await queryRunner.query(`
      CREATE INDEX IDX_POST_TYPES_SETTINGS ON post_types USING GIN(settings)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_POST_TYPES_SETTINGS`)
    await queryRunner.dropIndex('post_types', 'IDX_POST_TYPES_DELETED_AT')
    await queryRunner.dropIndex('post_types', 'IDX_POST_TYPES_SYSTEM')
    await queryRunner.dropIndex('post_types', 'IDX_POST_TYPES_ACTIVE')
    await queryRunner.dropIndex('post_types', 'IDX_POST_TYPES_NAME')
    await queryRunner.dropIndex('post_types', 'IDX_POST_TYPES_SLUG')
    await queryRunner.dropTable('post_types')
  }
}
