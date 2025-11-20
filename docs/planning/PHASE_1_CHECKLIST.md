# Phase 1 Implementation Checklist - Week 1

## Overview
**Goal**: Create database schema, entities, and repositories  
**Duration**: 5-7 days  
**Status**: Ready to start  
**Branch**: `feature/dynamic-post-types`

---

## Day 1-2: Database Schema & Migrations

### 1. Create Migration Files

- [ ] **Create PostTypes table migration**
  ```bash
  npm run migration:create -- CreatePostTypesTable
  ```
  
  **File**: `src/modules/post-types/migrations/XXXX-CreatePostTypesTable.ts`
  
  **Fields to include**:
  - id (UUID, primary key)
  - name (VARCHAR 100, unique, not null)
  - slug (VARCHAR 120, unique, not null)
  - description (TEXT)
  - singular_label, plural_label (VARCHAR 100)
  - is_hierarchical, supports_comments, supports_revisions (BOOLEAN)
  - is_active, is_system (BOOLEAN)
  - settings (JSONB)
  - created_by, updated_by (UUID, FK to users)
  - created_at, updated_at, deleted_at (TIMESTAMPTZ)
  - version (INTEGER)

- [ ] **Create FieldDefinitions table migration**
  ```bash
  npm run migration:create -- CreateFieldDefinitionsTable
  ```
  
  **File**: `src/modules/post-types/migrations/XXXX-CreateFieldDefinitionsTable.ts`
  
  **Fields to include**:
  - id (UUID, primary key)
  - post_type_id (UUID, FK to post_types, cascade delete)
  - name, label (VARCHAR)
  - field_type (ENUM: text, textarea, number, date, etc.)
  - default_value, placeholder (TEXT, VARCHAR)
  - is_required, is_unique, is_searchable (BOOLEAN)
  - display_order (INTEGER)
  - validation_rules (JSONB)
  - field_options (JSONB)
  - conditional_logic (JSONB)
  - metadata (JSONB)
  - Audit fields (created_by, updated_by, timestamps)

- [ ] **Create PostContent table migration**
  ```bash
  npm run migration:create -- CreatePostContentTable
  ```
  
  **File**: `src/modules/post-types/migrations/XXXX-CreatePostContentTable.ts`
  
  **Fields to include**:
  - id (UUID, primary key)
  - post_type_id (UUID, FK to post_types)
  - title, slug (VARCHAR, NOT NULL)
  - field_data (JSONB) ← **Most important field**
  - excerpt (TEXT)
  - featured_image_id (UUID, FK to attachments)
  - status (ENUM: draft, published, archived, etc.)
  - author_id (UUID, FK to users)
  - published_at, scheduled_at (TIMESTAMPTZ)
  - parent_id (UUID, FK to post_content, self-reference)
  - meta_title, meta_description (SEO fields)
  - view_count, like_count (INTEGER)
  - Audit fields

- [ ] **Create relation tables migration**
  ```bash
  npm run migration:create -- CreateRelationTables
  ```
  
  **Tables**:
  - post_content_attachments (many-to-many)
  - post_content_tags (many-to-many)
  - post_content_categories (many-to-many)

### 2. Create ENUM Types

- [ ] **Field type enum**
  ```sql
  CREATE TYPE field_type_enum AS ENUM (
    'text', 'textarea', 'wysiwyg', 'number', 'email', 'url', 'tel',
    'date', 'datetime', 'time', 'checkbox', 'radio', 'select', 'multiselect',
    'file', 'image', 'gallery', 'relation', 'user', 'taxonomy',
    'color', 'code', 'json', 'repeater', 'group'
  );
  ```

- [ ] **Content status enum**
  ```sql
  CREATE TYPE content_status_enum AS ENUM (
    'draft', 'pending_review', 'published', 'scheduled', 'archived', 'deleted'
  );
  ```

### 3. Create Indexes

- [ ] **PostTypes indexes**
  ```sql
  CREATE INDEX idx_post_types_slug ON post_types(slug);
  CREATE INDEX idx_post_types_active ON post_types(is_active);
  ```

- [ ] **FieldDefinitions indexes**
  ```sql
  CREATE INDEX idx_field_definitions_post_type ON field_definitions(post_type_id);
  CREATE INDEX idx_field_definitions_order ON field_definitions(post_type_id, display_order);
  ```

- [ ] **PostContent indexes** (CRITICAL for performance!)
  ```sql
  -- Core indexes
  CREATE INDEX idx_post_content_post_type ON post_content(post_type_id);
  CREATE INDEX idx_post_content_status ON post_content(status);
  CREATE INDEX idx_post_content_author ON post_content(author_id);
  CREATE INDEX idx_post_content_published ON post_content(published_at);
  
  -- GIN index for JSONB field_data (enables fast queries!)
  CREATE INDEX idx_post_content_field_data ON post_content USING GIN(field_data);
  
  -- Full-text search
  CREATE INDEX idx_post_content_search ON post_content USING GIN(
    to_tsvector('english', title || ' ' || COALESCE(excerpt, ''))
  );
  ```

### 4. Run Migrations

- [ ] **Test migrations**
  ```bash
  npm run migration:run
  ```

- [ ] **Verify tables created**
  ```bash
  psql -d kuybi_dev -c "\dt post_*"
  psql -d kuybi_dev -c "\dT *_enum"
  ```

---

## Day 3-4: Create Entities

### 5. PostType Entity

- [ ] **Create entity file**
  ```bash
  touch src/modules/post-types/entities/post-type.entity.ts
  ```

- [ ] **Implement entity**
  ```typescript
  import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

  @Entity({ name: 'post_types' })
  export class PostType {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ length: 100, unique: true })
    name: string

    @Column({ length: 120, unique: true })
    slug: string

    @Column({ type: 'text', nullable: true })
    description?: string

    @Column({ length: 100 })
    singularLabel: string

    @Column({ length: 100 })
    pluralLabel: string

    @Column({ default: false })
    isHierarchical: boolean

    @Column({ default: false })
    supportsComments: boolean

    @Column({ default: true })
    supportsRevisions: boolean

    @Column({ default: true })
    isActive: boolean

    @Column({ default: false })
    isSystem: boolean

    @Column({ type: 'jsonb', default: {} })
    settings: Record<string, any>

    @Column({ type: 'uuid', nullable: true })
    createdBy?: string

    @Column({ type: 'uuid', nullable: true })
    updatedBy?: string

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    deletedAt?: Date

    @Column({ default: 1 })
    version: number
  }
  ```

- [ ] **Add entity to DatabaseModule**
  ```typescript
  // src/core/database/database.module.ts
  entities: [
    // ... existing entities
    PostType
  ]
  ```

### 6. FieldDefinition Entity

- [ ] **Create entity file**
  ```bash
  touch src/modules/post-types/entities/field-definition.entity.ts
  ```

- [ ] **Create field type enum**
  ```bash
  touch src/modules/post-types/enums/field-type.enum.ts
  ```
  
  ```typescript
  export enum FieldType {
    TEXT = 'text',
    TEXTAREA = 'textarea',
    NUMBER = 'number',
    DATE = 'date',
    DATETIME = 'datetime',
    SELECT = 'select',
    MULTISELECT = 'multiselect',
    FILE = 'file',
    IMAGE = 'image',
    RELATION = 'relation',
    // ... add all 15+ types
  }
  ```

- [ ] **Implement entity**
  ```typescript
  @Entity({ name: 'field_definitions' })
  export class FieldDefinition {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'uuid' })
    postTypeId: string

    @ManyToOne(() => PostType)
    @JoinColumn({ name: 'postTypeId' })
    postType: PostType

    @Column({ length: 100 })
    name: string

    @Column({ length: 200 })
    label: string

    @Column({
      type: 'enum',
      enum: FieldType
    })
    fieldType: FieldType

    @Column({ type: 'text', nullable: true })
    description?: string

    @Column({ default: false })
    isRequired: boolean

    @Column({ default: false })
    isUnique: boolean

    @Column({ default: true })
    isSearchable: boolean

    @Column({ default: 0 })
    displayOrder: number

    @Column({ type: 'jsonb', default: {} })
    validationRules: Record<string, any>

    @Column({ type: 'jsonb', default: {} })
    fieldOptions: Record<string, any>

    @Column({ type: 'jsonb', nullable: true })
    conditionalLogic?: Record<string, any>

    // ... audit fields
  }
  ```

- [ ] **Add to DatabaseModule**

### 7. PostContent Entity

- [ ] **Create entity file**
  ```bash
  touch src/modules/post-types/entities/post-content.entity.ts
  ```

- [ ] **Create status enum**
  ```bash
  touch src/modules/post-types/enums/content-status.enum.ts
  ```

- [ ] **Implement entity**
  ```typescript
  @Entity({ name: 'post_content' })
  export class PostContent {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'uuid' })
    postTypeId: string

    @ManyToOne(() => PostType)
    @JoinColumn({ name: 'postTypeId' })
    postType: PostType

    @Column({ length: 500 })
    title: string

    @Column({ length: 550 })
    slug: string

    // ⭐ MOST IMPORTANT: Custom fields stored here
    @Column({ type: 'jsonb', default: {} })
    fieldData: Record<string, any>

    @Column({ type: 'text', nullable: true })
    excerpt?: string

    @Column({
      type: 'enum',
      enum: ContentStatus,
      default: ContentStatus.DRAFT
    })
    status: ContentStatus

    @Column({ type: 'uuid' })
    authorId: string

    @ManyToOne(() => User)
    @JoinColumn({ name: 'authorId' })
    author: User

    @Column({ type: 'timestamptz', nullable: true })
    publishedAt?: Date

    // ... more fields
  }
  ```

- [ ] **Add to DatabaseModule**

### 8. Junction Entities

- [ ] **Create junction entities** (3 files)
  - post-content-attachment.entity.ts
  - post-content-tag.entity.ts
  - post-content-category.entity.ts

- [ ] **Add to DatabaseModule**

---

## Day 5-6: Create Repositories

### 9. PostTypeRepository

- [ ] **Create repository file**
  ```bash
  mkdir -p src/modules/post-types/repositories
  touch src/modules/post-types/repositories/post-type.repository.ts
  ```

- [ ] **Extend BaseRepository**
  ```typescript
  @Injectable()
  export class PostTypeRepository extends BaseRepository<PostType> {
    protected entityName = 'post_type'

    constructor(
      @InjectRepository(PostType)
      private readonly postTypeRepository: Repository<PostType>,
      protected readonly cacheService: CacheService
    ) {
      super(postTypeRepository, cacheService)
    }

    async findBySlug(slug: string): Promise<PostType | null> {
      const cacheKey = `${this.entityName}:slug:${slug}`
      return this.findOne({ slug }, { cacheKey, ttl: 1800 }) // 30 min
    }

    async findActive(): Promise<PostType[]> {
      const cacheKey = `${this.entityName}:active`
      return this.find({ isActive: true }, { cacheKey, ttl: 1800 })
    }

    // ... more methods
  }
  ```

- [ ] **Create repository tests**
  ```bash
  touch src/modules/post-types/repositories/post-type.repository.spec.ts
  ```

### 10. FieldDefinitionRepository

- [ ] **Create repository file**
  ```bash
  touch src/modules/post-types/repositories/field-definition.repository.ts
  ```

- [ ] **Implement core methods**
  ```typescript
  @Injectable()
  export class FieldDefinitionRepository extends BaseRepository<FieldDefinition> {
    protected entityName = 'field_definition'

    async findByPostType(postTypeId: string): Promise<FieldDefinition[]> {
      const cacheKey = `${this.entityName}:post_type:${postTypeId}`
      return this.find(
        { postTypeId, deletedAt: null },
        { 
          cacheKey, 
          ttl: 900, // 15 min
          order: { displayOrder: 'ASC' }
        }
      )
    }

    async findRequiredFields(postTypeId: string): Promise<FieldDefinition[]> {
      const cacheKey = `${this.entityName}:required:${postTypeId}`
      return this.find(
        { postTypeId, isRequired: true, deletedAt: null },
        { cacheKey, ttl: 900 }
      )
    }

    // ... more methods
  }
  ```

- [ ] **Create repository tests**

### 11. PostContentRepository

- [ ] **Create repository file**
  ```bash
  touch src/modules/post-types/repositories/post-content.repository.ts
  ```

- [ ] **Implement core methods**
  ```typescript
  @Injectable()
  export class PostContentRepository extends BaseRepository<PostContent> {
    protected entityName = 'post_content'

    async findByPostType(
      postTypeId: string,
      pagination?: PaginationOptions
    ): Promise<[PostContent[], number]> {
      const qb = this.repository
        .createQueryBuilder('content')
        .where('content.post_type_id = :postTypeId', { postTypeId })
        .andWhere('content.deleted_at IS NULL')

      if (pagination) {
        qb.skip(pagination.offset).take(pagination.limit)
      }

      return qb.getManyAndCount()
    }

    async existsByFieldValue(
      postTypeId: string,
      fieldName: string,
      value: any
    ): Promise<boolean> {
      const count = await this.repository
        .createQueryBuilder('content')
        .where('content.post_type_id = :postTypeId', { postTypeId })
        .andWhere(`content.field_data->>'${fieldName}' = :value`, { 
          value: String(value) 
        })
        .getCount()

      return count > 0
    }

    // ... more methods
  }
  ```

- [ ] **Create repository tests**

---

## Day 7: Services & Module Setup

### 12. Create Services (Skeleton)

- [ ] **PostTypesService**
  ```bash
  mkdir -p src/modules/post-types/services
  touch src/modules/post-types/services/post-types.service.ts
  ```
  
  Basic CRUD methods:
  - create()
  - findAll()
  - findBySlug()
  - update()
  - delete()

- [ ] **FieldDefinitionsService**
  ```bash
  touch src/modules/post-types/services/field-definitions.service.ts
  ```
  
  Basic CRUD methods:
  - create()
  - findByPostType()
  - update()
  - delete()
  - reorder()

- [ ] **ContentService** (skeleton only)
  ```bash
  touch src/modules/post-types/services/content.service.ts
  ```

### 13. Create Module

- [ ] **Create module file**
  ```bash
  touch src/modules/post-types/post-types.module.ts
  ```

- [ ] **Register everything**
  ```typescript
  @Module({
    imports: [
      TypeOrmModule.forFeature([
        PostType,
        FieldDefinition,
        PostContent,
        // ... junction entities
      ]),
      CacheModule
    ],
    providers: [
      PostTypeRepository,
      FieldDefinitionRepository,
      PostContentRepository,
      PostTypesService,
      FieldDefinitionsService,
      ContentService
    ],
    exports: [
      PostTypesService,
      FieldDefinitionsService,
      ContentService
    ]
  })
  export class PostTypesModule {}
  ```

- [ ] **Register in AppModule**
  ```typescript
  // src/app.module.ts
  @Module({
    imports: [
      // ... existing modules
      PostTypesModule
    ]
  })
  ```

### 14. Create Barrel Exports

- [ ] **Create index files**
  ```bash
  touch src/modules/post-types/entities/index.ts
  touch src/modules/post-types/repositories/index.ts
  touch src/modules/post-types/services/index.ts
  touch src/modules/post-types/enums/index.ts
  touch src/modules/post-types/index.ts
  ```

---

## Testing & Validation

### 15. Run Tests

- [ ] **Run migrations**
  ```bash
  npm run migration:run
  ```

- [ ] **Verify database schema**
  ```bash
  psql -d kuybi_dev -c "\d post_types"
  psql -d kuybi_dev -c "\d field_definitions"
  psql -d kuybi_dev -c "\d post_content"
  ```

- [ ] **Check indexes**
  ```bash
  psql -d kuybi_dev -c "\di post_*"
  ```

- [ ] **Run unit tests**
  ```bash
  npm run test -- post-types
  ```

- [ ] **Test repository caching**
  ```typescript
  // Manual test in a service
  const postType1 = await postTypeRepo.findBySlug('test')
  const postType2 = await postTypeRepo.findBySlug('test') // Should be cached
  ```

### 16. Seed Test Data

- [ ] **Create seeder**
  ```bash
  touch src/database/seeders/post-types.seeder.ts
  ```

- [ ] **Seed basic post types**
  ```typescript
  // Create "Story" post type (migrate from existing)
  await postTypeRepo.save({
    name: 'Story',
    slug: 'story',
    singularLabel: 'Story',
    pluralLabel: 'Stories',
    isSystem: true
  })

  // Create "Event" post type (test)
  await postTypeRepo.save({
    name: 'Event',
    slug: 'event',
    singularLabel: 'Event',
    pluralLabel: 'Events'
  })
  ```

- [ ] **Run seeder**
  ```bash
  npm run db:seed:post-types
  ```

---

## Documentation

### 17. Update Progress

- [ ] **Update ENTERPRISE_PROGRESS.md**
  - Mark Phase 1 as complete
  - Add completion date
  - Update progress percentage

- [ ] **Create Phase 1 summary**
  - Tables created: 7
  - Entities created: 6
  - Repositories created: 3
  - Services created: 3 (skeleton)
  - Lines of code: ~2,000

---

## ✅ Phase 1 Completion Checklist

- [ ] All 4 migrations created and run successfully
- [ ] 6 entities implemented
- [ ] 3 repositories with caching
- [ ] 3 services (skeleton)
- [ ] Module registered in AppModule
- [ ] All unit tests passing
- [ ] Test data seeded
- [ ] Documentation updated

---

## 🎯 Success Criteria

✅ **Database**:
- All tables exist
- All indexes created
- Foreign keys working
- GIN index on field_data

✅ **Code**:
- Entities compile without errors
- Repositories extend BaseRepository
- Caching working (verify with Redis)
- Services inject repositories correctly

✅ **Tests**:
- Repository tests passing
- Can create/read entities
- Cache hit/miss working

---

## Next: Phase 2 (Week 2)

Once Phase 1 is complete, move to:
- **Field Type Validators** (15+ validators)
- **ContentValidatorService**
- **Schema validation logic**

---

**Estimated Time**: 5-7 days  
**Current Status**: ⏳ Ready to start  
**Branch**: `feature/dynamic-post-types`
