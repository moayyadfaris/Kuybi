import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm'

/**
 * Migration: Create field_definitions table
 *
 * This table stores custom field schemas for each post type.
 * Each post type can have multiple field definitions (like ACF fields in WordPress).
 *
 * Key Features:
 * - 25+ field types (text, number, date, select, file, relation, etc.)
 * - JSONB validation_rules for flexible validation (min/max, pattern, etc.)
 * - JSONB field_options for type-specific config (choices, target types, etc.)
 * - JSONB conditional_logic for show/hide rules based on other fields
 * - Display ordering for form generation
 * - Field groups for organization
 * - Unique/required/searchable flags
 * - Full audit trail
 *
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
export class CreateFieldDefinitionsTable1732000200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'field_definitions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },

          // Relationship to Post Type
          {
            name: 'postTypeId',
            type: 'uuid',
            isNullable: false,
            comment: 'Post type this field belongs to'
          },

          // Basic Field Information
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
            comment: 'Field name (e.g., "event_date", "price") - used in field_data JSONB'
          },
          {
            name: 'label',
            type: 'varchar',
            length: '200',
            isNullable: false,
            comment: 'Display label for UI (e.g., "Event Date", "Price")'
          },
          {
            name: 'fieldType',
            type: 'field_type_enum',
            isNullable: false,
            comment: 'Type of field (text, number, date, select, etc.)'
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
            comment: 'Help text or description for this field'
          },

          // Default Values & Placeholder
          {
            name: 'defaultValue',
            type: 'text',
            isNullable: true,
            comment: 'Default value (stored as string, cast based on fieldType)'
          },
          {
            name: 'placeholder',
            type: 'varchar',
            length: '200',
            isNullable: true,
            comment: 'Placeholder text for input fields'
          },

          // Validation Flags
          {
            name: 'isRequired',
            type: 'boolean',
            default: false,
            comment: 'Is this field required?'
          },
          {
            name: 'isUnique',
            type: 'boolean',
            default: false,
            comment: 'Must value be unique across all content?'
          },
          {
            name: 'isSearchable',
            type: 'boolean',
            default: true,
            comment: 'Include in search index?'
          },
          {
            name: 'isFilterable',
            type: 'boolean',
            default: true,
            comment: 'Can filter/query by this field?'
          },
          {
            name: 'isSortable',
            type: 'boolean',
            default: true,
            comment: 'Can sort by this field?'
          },

          // Display Configuration
          {
            name: 'displayOrder',
            type: 'integer',
            default: 0,
            comment: 'Order in forms/displays (lower = first)'
          },
          {
            name: 'fieldGroup',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Group name for organizing fields (e.g., "Basic Info", "Pricing")'
          },
          {
            name: 'helpText',
            type: 'text',
            isNullable: true,
            comment: 'Detailed help text shown below field'
          },

          // Validation Rules (JSONB - flexible per field type)
          // Example for text: { "minLength": 5, "maxLength": 100, "pattern": "^[a-z]+$" }
          // Example for number: { "min": 0, "max": 1000, "integer": true }
          // Example for date: { "minDate": "2025-01-01", "maxDate": "2025-12-31" }
          {
            name: 'validationRules',
            type: 'jsonb',
            default: "'{}'",
            comment: 'Type-specific validation rules as JSON'
          },

          // Field-Specific Options (JSONB - varies by field type)
          // Example for select: { "choices": ["option1", "option2"], "allowOther": true }
          // Example for relation: { "targetPostType": "product", "multiple": true, "createNew": false }
          // Example for file: { "allowedTypes": ["image/jpeg", "image/png"], "maxSize": 5242880 }
          {
            name: 'fieldOptions',
            type: 'jsonb',
            default: "'{}'",
            comment: 'Field-type-specific configuration as JSON'
          },

          // Conditional Logic (JSONB)
          // Example: { "show_if": { "fieldId": "uuid", "operator": "equals", "value": "yes" } }
          // Determines if field should be shown based on other field values
          {
            name: 'conditionalLogic',
            type: 'jsonb',
            isNullable: true,
            comment: 'Rules for when to show/hide this field based on other fields'
          },

          // Additional Metadata
          {
            name: 'metadata',
            type: 'jsonb',
            default: "'{}'",
            comment: 'Additional custom metadata for this field'
          },

          // Audit Trail
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: true,
            comment: 'User who created this field definition'
          },
          {
            name: 'updatedBy',
            type: 'uuid',
            isNullable: true,
            comment: 'User who last updated this field definition'
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

    // Foreign key to post_types (CASCADE DELETE - if post type deleted, delete fields)
    await queryRunner.createForeignKey(
      'field_definitions',
      new TableForeignKey({
        name: 'FK_FIELD_DEFINITIONS_POST_TYPE',
        columnNames: ['postTypeId'],
        referencedTableName: 'post_types',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE' // Critical: Delete fields when post type deleted
      })
    )

    // Foreign keys to users (audit trail)
    await queryRunner.createForeignKey(
      'field_definitions',
      new TableForeignKey({
        name: 'FK_FIELD_DEFINITIONS_CREATED_BY',
        columnNames: ['createdBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    await queryRunner.createForeignKey(
      'field_definitions',
      new TableForeignKey({
        name: 'FK_FIELD_DEFINITIONS_UPDATED_BY',
        columnNames: ['updatedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    )

    // Create indexes for performance
    await queryRunner.createIndex(
      'field_definitions',
      new TableIndex({
        name: 'IDX_FIELD_DEFINITIONS_POST_TYPE',
        columnNames: ['postTypeId']
      })
    )

    await queryRunner.createIndex(
      'field_definitions',
      new TableIndex({
        name: 'IDX_FIELD_DEFINITIONS_NAME',
        columnNames: ['name']
      })
    )

    await queryRunner.createIndex(
      'field_definitions',
      new TableIndex({
        name: 'IDX_FIELD_DEFINITIONS_TYPE',
        columnNames: ['fieldType']
      })
    )

    await queryRunner.createIndex(
      'field_definitions',
      new TableIndex({
        name: 'IDX_FIELD_DEFINITIONS_REQUIRED',
        columnNames: ['isRequired']
      })
    )

    // Composite index for ordering fields within a post type
    await queryRunner.createIndex(
      'field_definitions',
      new TableIndex({
        name: 'IDX_FIELD_DEFINITIONS_POST_TYPE_ORDER',
        columnNames: ['postTypeId', 'displayOrder']
      })
    )

    // Unique constraint: field name must be unique within a post type
    await queryRunner.createIndex(
      'field_definitions',
      new TableIndex({
        name: 'IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE',
        columnNames: ['postTypeId', 'name'],
        isUnique: true
      })
    )

    await queryRunner.createIndex(
      'field_definitions',
      new TableIndex({
        name: 'IDX_FIELD_DEFINITIONS_DELETED_AT',
        columnNames: ['deletedAt']
      })
    )

    // GIN indexes for JSONB columns (fast queries on JSON data)
    await queryRunner.query(`
      CREATE INDEX "IDX_FIELD_DEFINITIONS_VALIDATION_RULES" 
      ON field_definitions USING GIN("validationRules")
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_FIELD_DEFINITIONS_FIELD_OPTIONS" 
      ON field_definitions USING GIN("fieldOptions")
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_FIELD_DEFINITIONS_CONDITIONAL_LOGIC" 
      ON field_definitions USING GIN("conditionalLogic")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop GIN indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_FIELD_DEFINITIONS_CONDITIONAL_LOGIC"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_FIELD_DEFINITIONS_FIELD_OPTIONS"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_FIELD_DEFINITIONS_VALIDATION_RULES"`)

    // Drop regular indexes
    await queryRunner.dropIndex('field_definitions', 'IDX_FIELD_DEFINITIONS_DELETED_AT')
    await queryRunner.dropIndex('field_definitions', 'IDX_FIELD_DEFINITIONS_NAME_POST_TYPE_UNIQUE')
    await queryRunner.dropIndex('field_definitions', 'IDX_FIELD_DEFINITIONS_POST_TYPE_ORDER')
    await queryRunner.dropIndex('field_definitions', 'IDX_FIELD_DEFINITIONS_REQUIRED')
    await queryRunner.dropIndex('field_definitions', 'IDX_FIELD_DEFINITIONS_TYPE')
    await queryRunner.dropIndex('field_definitions', 'IDX_FIELD_DEFINITIONS_NAME')
    await queryRunner.dropIndex('field_definitions', 'IDX_FIELD_DEFINITIONS_POST_TYPE')

    // Drop foreign keys
    await queryRunner.dropForeignKey('field_definitions', 'FK_FIELD_DEFINITIONS_UPDATED_BY')
    await queryRunner.dropForeignKey('field_definitions', 'FK_FIELD_DEFINITIONS_CREATED_BY')
    await queryRunner.dropForeignKey('field_definitions', 'FK_FIELD_DEFINITIONS_POST_TYPE')

    // Drop table
    await queryRunner.dropTable('field_definitions')
  }
}
