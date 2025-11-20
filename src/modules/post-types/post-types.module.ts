import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AclModule } from '@modules/acl/acl.module'

// Entities
import {
  PostType,
  FieldDefinition,
  PostContent,
  PostContentAttachment,
  PostContentTag,
  PostContentCategory
} from './entities'

// Repositories
import {
  PostTypeRepository,
  FieldDefinitionRepository,
  PostContentRepository
} from './repositories'

// Services
import {
  PostTypesService,
  FieldDefinitionsService,
  ContentService,
  FieldValidationService
} from './services'
import { PostTypesSeeder } from './seeders'

// Controllers
import { PostTypesController, FieldDefinitionsController, ContentController } from './controllers'

/**
 * PostTypesModule
 *
 * Dynamic Post Types System - Phase 1 Module
 *
 * Provides WordPress + ACF-like functionality for creating custom post types
 * with dynamic fields without requiring database schema changes.
 *
 * Features (Phase 1):
 * - Post type management (Event, Product, Recipe, etc.)
 * - Field definition management (25 field types)
 * - Content management with JSONB field_data
 * - Redis caching (30-min, 15-min, 10-min TTLs)
 * - Full-text search
 * - Publishing workflow
 *
 * Exports:
 * - PostTypesService (CRUD for post types)
 * - FieldDefinitionsService (CRUD for field definitions)
 * - ContentService (skeleton - full implementation in Phase 2)
 * - All 3 repositories (for advanced use cases)
 *
 * Phase 2 Additions (COMPLETE):
 * - Controllers (19 REST API endpoints) ✅
 * - DTOs (13 DTOs with validation) ✅
 * - ACL integration (JwtAuthGuard + AbilityGuard) ✅
 * - Swagger documentation (OpenAPI) ✅
 *
 * Phase 2 In Progress:
 * - Field validators (15+ validators)
 * - Dynamic query builder
 *
 * Part of: Phase 2 - Dynamic Post Types System
 * @see docs/planning/DYNAMIC_POST_TYPES_PLAN.md
 */
@Module({
  imports: [
    // Register entities with TypeORM
    TypeOrmModule.forFeature([
      PostType,
      FieldDefinition,
      PostContent,
      PostContentAttachment,
      PostContentTag,
      PostContentCategory
    ]),
    // ACL module for AbilityGuard and permissions
    AclModule
  ],
  controllers: [
    // REST API controllers (Phase 2)
    PostTypesController,
    FieldDefinitionsController,
    ContentController
  ],
  providers: [
    // Repositories
    PostTypeRepository,
    FieldDefinitionRepository,
    PostContentRepository,
    // Services
    PostTypesService,
    FieldDefinitionsService,
    ContentService,
    FieldValidationService,
    // Seeders (for db:seed:post-types command)
    PostTypesSeeder
  ],
  exports: [
    // Export services for use in other modules
    PostTypesService,
    FieldDefinitionsService,
    ContentService,
    FieldValidationService,

    // Export repositories for advanced use cases
    PostTypeRepository,
    FieldDefinitionRepository,
    PostContentRepository
  ]
})
export class PostTypesModule {}
