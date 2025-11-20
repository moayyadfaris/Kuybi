import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Migration: Create ENUM types for Post Types system
 * 
 * Creates two critical ENUM types:
 * 1. field_type_enum - 25 field types for dynamic schemas
 * 2. content_status_enum - 6 content statuses for publishing workflow
 * 
 * Part of: Phase 1 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
export class CreatePostTypesEnums1732000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create field_type_enum with 25 comprehensive field types
    await queryRunner.query(`
      CREATE TYPE field_type_enum AS ENUM (
        -- Text types
        'text',
        'textarea',
        'wysiwyg',
        'email',
        'url',
        'tel',
        'code',
        
        -- Number types
        'number',
        'currency',
        
        -- Date/Time types
        'date',
        'datetime',
        'time',
        
        -- Selection types
        'checkbox',
        'radio',
        'select',
        'multiselect',
        'toggle',
        
        -- Media types
        'file',
        'image',
        'gallery',
        'video',
        
        -- Relationship types
        'relation',
        'user',
        'taxonomy',
        
        -- Advanced types
        'color',
        'json',
        'repeater',
        'group'
      )
    `)

    // Create content_status_enum for publishing workflow
    await queryRunner.query(`
      CREATE TYPE content_status_enum AS ENUM (
        'draft',
        'pending_review',
        'published',
        'scheduled',
        'archived',
        'deleted'
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TYPE IF EXISTS content_status_enum`)
    await queryRunner.query(`DROP TYPE IF EXISTS field_type_enum`)
  }
}
