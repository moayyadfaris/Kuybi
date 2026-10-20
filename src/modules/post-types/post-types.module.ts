import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AclModule } from '@modules/acl'
import { UsersModule } from '@modules/users'

// Controllers
import { IdempotencyModule } from '@core/idempotency'

import { ContentController, FieldDefinitionsController, PostTypesController } from './controllers'
// Entities
import {
  FieldDefinition,
  PostContent,
  PostContentAttachment,
  PostContentCategory,
  PostContentTag,
  PostType
} from './entities'
// Repositories
import {
  FieldDefinitionRepository,
  PostContentRepository,
  PostTypeRepository
} from './repositories'
import { PostTypesSeeder } from './seeders'
// Services
import {
  ContentAccessPolicy,
  ContentService,
  FieldDefinitionsService,
  FieldValidationService,
  PostTypesService
} from './services'

/**
 * Dynamic post types (WordPress/ACF-like): post types, their custom fields, and entries
 * whose field values live in a JSONB column, with a publishing workflow. Scheduled
 * publishing runs in the worker (PostTypesJobsModule).
 */
@Module({
  imports: [
    IdempotencyModule,
    TypeOrmModule.forFeature([
      PostType,
      FieldDefinition,
      PostContent,
      PostContentAttachment,
      PostContentTag,
      PostContentCategory
    ]),
    AclModule,
    UsersModule
  ],

  controllers: [PostTypesController, FieldDefinitionsController, ContentController],
  providers: [
    // Repositories
    PostTypeRepository,
    FieldDefinitionRepository,
    PostContentRepository,

    // Services
    PostTypesService,
    FieldDefinitionsService,
    ContentService,
    ContentAccessPolicy,
    FieldValidationService,
    // Seeders (for db:seed:post-types command)
    PostTypesSeeder
  ],
  // The worker's publishing job
  exports: [ContentService]
})
export class PostTypesModule {}
