# Dynamic Post Type System - Enterprise Architecture Plan

## Executive Summary

Build a WordPress + ACF-like system where frontend can dynamically define post types (similar to "Page", "Product", "Event") and attach custom fields to each type. Backend stores both schema definitions and data instances with full type validation, query capabilities, and ACL integration.

**Branch**: `feature/dynamic-post-types`  
**Estimated Duration**: 4-5 weeks  
**Priority**: High (Next major feature)  
**Complexity**: High (Enterprise-grade with DDD principles)

---

## 🎯 Business Requirements

### Core Capabilities

1. **Dynamic Post Type Creation**
   - Frontend defines custom post types (e.g., "Event", "Product", "Recipe")
   - Configure display name, slug, icon, description
   - Set visibility, permissions, enabled status
   - Support for hierarchical types (parent-child relationships)

2. **Custom Field Builder**
   - Define fields for each post type
   - 15+ field types (text, number, date, select, multiselect, relation, file, etc.)
   - Field validation rules (required, min/max, regex, unique)
   - Conditional logic (show field X if field Y = value)
   - Field groups for organization

3. **Dynamic Data Management**
   - Create/read/update/delete instances of custom post types
   - Type-safe validation based on field definitions
   - Bulk operations (import/export)
   - Versioning and audit trail

4. **Query & Search**
   - Dynamic query API for any post type
   - Filter by custom field values
   - Full-text search across custom fields
   - Sort, paginate, aggregate

5. **Integration**
   - ACL integration (per-type permissions)
   - Attachments (media library)
   - Tags and categories
   - Audit logging
   - Cache strategy

---

## 🏗️ Architecture Design

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Controllers)                  │
│  PostTypeController | FieldDefinitionController | ContentCtrl│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Application Layer (Services)                │
│  PostTypeService | FieldDefinitionService | ContentService   │
│  ValidationService | QueryBuilderService | SchemaService     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     Domain Layer (Logic)                     │
│  PostType Entity | FieldDefinition Entity | ContentEntity    │
│  FieldValidators | SchemaValidator | ContentFactory          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│              Infrastructure Layer (Persistence)              │
│  PostTypeRepository | FieldDefinitionRepository              │
│  ContentRepository | ElasticSearch (optional)                │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema Design

#### 1. Post Types Table (`post_types`)

```sql
CREATE TABLE post_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Basic Info
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  
  -- Configuration
  is_hierarchical BOOLEAN DEFAULT false,
  supports_comments BOOLEAN DEFAULT false,
  supports_revisions BOOLEAN DEFAULT true,
  menu_position INTEGER DEFAULT 100,
  
  -- Display
  singular_label VARCHAR(100) NOT NULL,
  plural_label VARCHAR(100) NOT NULL,
  menu_icon VARCHAR(50),
  
  -- Capabilities (ACL integration)
  capability_type VARCHAR(50) DEFAULT 'post',
  
  -- REST API
  show_in_rest BOOLEAN DEFAULT true,
  rest_base VARCHAR(100),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  
  -- Metadata
  settings JSONB DEFAULT '{}',
  
  -- Audit
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  
  -- Indexes
  CONSTRAINT post_types_name_unique UNIQUE(name),
  CONSTRAINT post_types_slug_unique UNIQUE(slug)
);

CREATE INDEX idx_post_types_slug ON post_types(slug);
CREATE INDEX idx_post_types_active ON post_types(is_active);
CREATE INDEX idx_post_types_system ON post_types(is_system);
```

#### 2. Field Definitions Table (`field_definitions`)

```sql
CREATE TYPE field_type_enum AS ENUM (
  'text', 'textarea', 'wysiwyg', 'number', 'email', 'url', 'tel',
  'date', 'datetime', 'time', 'checkbox', 'radio', 'select', 'multiselect',
  'file', 'image', 'gallery', 'relation', 'user', 'taxonomy',
  'color', 'code', 'json', 'repeater', 'group'
);

CREATE TABLE field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relationship
  post_type_id UUID NOT NULL REFERENCES post_types(id) ON DELETE CASCADE,
  
  -- Basic Info
  name VARCHAR(100) NOT NULL,
  label VARCHAR(200) NOT NULL,
  field_type field_type_enum NOT NULL,
  description TEXT,
  
  -- Configuration
  default_value TEXT,
  placeholder VARCHAR(200),
  is_required BOOLEAN DEFAULT false,
  is_unique BOOLEAN DEFAULT false,
  is_searchable BOOLEAN DEFAULT true,
  is_filterable BOOLEAN DEFAULT true,
  is_sortable BOOLEAN DEFAULT true,
  
  -- Display
  display_order INTEGER DEFAULT 0,
  field_group VARCHAR(100),
  help_text TEXT,
  
  -- Validation Rules (JSONB for flexibility)
  validation_rules JSONB DEFAULT '{}',
  -- Example: { "minLength": 5, "maxLength": 100, "pattern": "^[a-z]+$" }
  
  -- Field-specific Options (JSONB)
  field_options JSONB DEFAULT '{}',
  -- Example for select: { "choices": ["option1", "option2"] }
  -- Example for relation: { "targetPostType": "product", "multiple": true }
  
  -- Conditional Logic (JSONB)
  conditional_logic JSONB,
  -- Example: { "show_if": { "fieldId": "uuid", "operator": "equals", "value": "yes" } }
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Audit
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  
  -- Indexes
  CONSTRAINT field_definitions_name_post_type UNIQUE(post_type_id, name)
);

CREATE INDEX idx_field_definitions_post_type ON field_definitions(post_type_id);
CREATE INDEX idx_field_definitions_type ON field_definitions(field_type);
CREATE INDEX idx_field_definitions_required ON field_definitions(is_required);
CREATE INDEX idx_field_definitions_order ON field_definitions(post_type_id, display_order);
```

#### 3. Content Table (`post_content`)

```sql
CREATE TYPE content_status_enum AS ENUM (
  'draft', 'pending_review', 'published', 'scheduled', 'archived', 'deleted'
);

CREATE TABLE post_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Relationship
  post_type_id UUID NOT NULL REFERENCES post_types(id) ON DELETE RESTRICT,
  
  -- Core Fields (always present)
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(550) NOT NULL,
  
  -- Custom Fields Data (stored as JSONB)
  field_data JSONB NOT NULL DEFAULT '{}',
  -- Example: { "price": 99.99, "color": "red", "tags": ["sale", "new"] }
  
  -- Metadata
  excerpt TEXT,
  featured_image_id UUID REFERENCES attachments(id),
  
  -- Status
  status content_status_enum DEFAULT 'draft',
  
  -- Publishing
  author_id UUID NOT NULL REFERENCES users(id),
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  
  -- Hierarchy (if post type supports it)
  parent_id UUID REFERENCES post_content(id) ON DELETE SET NULL,
  menu_order INTEGER DEFAULT 0,
  
  -- SEO (optional)
  meta_title VARCHAR(200),
  meta_description TEXT,
  meta_keywords TEXT,
  
  -- Stats
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  
  -- Audit
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  
  -- Indexes
  CONSTRAINT post_content_slug_post_type UNIQUE(post_type_id, slug)
);

-- Essential Indexes
CREATE INDEX idx_post_content_post_type ON post_content(post_type_id);
CREATE INDEX idx_post_content_status ON post_content(status);
CREATE INDEX idx_post_content_author ON post_content(author_id);
CREATE INDEX idx_post_content_published ON post_content(published_at);
CREATE INDEX idx_post_content_parent ON post_content(parent_id);

-- GIN index for JSONB field_data (enables fast queries on custom fields)
CREATE INDEX idx_post_content_field_data ON post_content USING GIN(field_data);

-- Full-text search
CREATE INDEX idx_post_content_search ON post_content USING GIN(
  to_tsvector('english', title || ' ' || COALESCE(excerpt, ''))
);
```

#### 4. Relations Tables (Many-to-Many)

```sql
-- Post Content <-> Attachments
CREATE TABLE post_content_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_content_id UUID NOT NULL REFERENCES post_content(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT post_content_attachments_unique UNIQUE(post_content_id, attachment_id)
);

-- Post Content <-> Tags
CREATE TABLE post_content_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_content_id UUID NOT NULL REFERENCES post_content(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT post_content_tags_unique UNIQUE(post_content_id, tag_id)
);

-- Post Content <-> Categories
CREATE TABLE post_content_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_content_id UUID NOT NULL REFERENCES post_content(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT post_content_categories_unique UNIQUE(post_content_id, category_id)
);
```

---

## 📦 Module Structure

Following enterprise DDD principles:

```
src/modules/post-types/
├── post-types.module.ts
├── controllers/
│   ├── post-types.controller.ts        # CRUD for post type definitions
│   ├── field-definitions.controller.ts # CRUD for field schemas
│   └── content.controller.ts           # CRUD for content instances
├── services/
│   ├── post-types.service.ts           # Post type management
│   ├── field-definitions.service.ts    # Field schema management
│   ├── content.service.ts              # Content instance management
│   ├── schema-validator.service.ts     # Schema validation logic
│   ├── content-validator.service.ts    # Runtime data validation
│   ├── query-builder.service.ts        # Dynamic query generation
│   └── content-exporter.service.ts     # Import/export utilities
├── entities/
│   ├── post-type.entity.ts
│   ├── field-definition.entity.ts
│   ├── post-content.entity.ts
│   ├── post-content-attachment.entity.ts
│   ├── post-content-tag.entity.ts
│   └── post-content-category.entity.ts
├── repositories/
│   ├── post-type.repository.ts
│   ├── field-definition.repository.ts
│   └── post-content.repository.ts
├── dto/
│   ├── post-types/
│   │   ├── create-post-type.dto.ts
│   │   ├── update-post-type.dto.ts
│   │   └── post-type-response.dto.ts
│   ├── field-definitions/
│   │   ├── create-field-definition.dto.ts
│   │   ├── update-field-definition.dto.ts
│   │   └── field-definition-response.dto.ts
│   └── content/
│       ├── create-content.dto.ts       # Generic, validated at runtime
│       ├── update-content.dto.ts
│       ├── query-content.dto.ts
│       └── content-response.dto.ts
├── guards/
│   ├── post-type-exists.guard.ts       # Ensure post type exists
│   └── field-validation.guard.ts       # Validate field data
├── decorators/
│   ├── validate-custom-fields.decorator.ts
│   └── post-type-slug.decorator.ts
├── validators/
│   ├── field-type.validator.ts         # Per-field-type validation
│   ├── text-field.validator.ts
│   ├── number-field.validator.ts
│   ├── date-field.validator.ts
│   ├── select-field.validator.ts
│   ├── relation-field.validator.ts
│   └── file-field.validator.ts
├── interfaces/
│   ├── field-type.interface.ts
│   ├── validation-rule.interface.ts
│   └── query-filter.interface.ts
├── enums/
│   ├── field-type.enum.ts
│   ├── content-status.enum.ts
│   └── validation-operator.enum.ts
└── migrations/
    ├── 1700000000000-CreatePostTypesTable.ts
    ├── 1700000000001-CreateFieldDefinitionsTable.ts
    ├── 1700000000002-CreatePostContentTable.ts
    └── 1700000000003-CreateRelationTables.ts
```

---

## 🔧 Technical Implementation Details

### 1. Field Type System (Strategy Pattern)

Each field type implements a validator:

```typescript
// validators/base-field.validator.ts
export abstract class BaseFieldValidator {
  abstract validateValue(
    value: any,
    definition: FieldDefinition,
    allValues: Record<string, any>
  ): Promise<ValidationResult>

  abstract sanitizeValue(value: any, definition: FieldDefinition): any

  protected checkRequired(value: any, definition: FieldDefinition): ValidationResult {
    if (definition.isRequired && (value === null || value === undefined || value === '')) {
      return { isValid: false, errors: [`${definition.label} is required`] }
    }
    return { isValid: true, errors: [] }
  }

  protected applyValidationRules(
    value: any,
    rules: ValidationRules
  ): ValidationResult {
    // Common validation logic (min/max, pattern, etc.)
  }
}

// validators/text-field.validator.ts
@Injectable()
export class TextFieldValidator extends BaseFieldValidator {
  async validateValue(
    value: any,
    definition: FieldDefinition,
    allValues: Record<string, any>
  ): Promise<ValidationResult> {
    // 1. Check required
    const requiredCheck = this.checkRequired(value, definition)
    if (!requiredCheck.isValid) return requiredCheck

    if (value === null || value === undefined) {
      return { isValid: true, errors: [] }
    }

    // 2. Type check
    if (typeof value !== 'string') {
      return { isValid: false, errors: ['Value must be a string'] }
    }

    // 3. Apply validation rules
    const rules = definition.validationRules as TextValidationRules
    const errors: string[] = []

    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`Minimum length is ${rules.minLength}`)
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`Maximum length is ${rules.maxLength}`)
    }

    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      errors.push('Value does not match required pattern')
    }

    // 4. Check uniqueness (if required)
    if (definition.isUnique) {
      const exists = await this.contentRepository.existsByFieldValue(
        definition.postTypeId,
        definition.name,
        value
      )
      if (exists) {
        errors.push(`${definition.label} must be unique`)
      }
    }

    return { isValid: errors.length === 0, errors }
  }

  sanitizeValue(value: any, definition: FieldDefinition): string {
    if (typeof value !== 'string') return ''
    
    const rules = definition.validationRules as TextValidationRules
    let sanitized = value.trim()

    if (rules.maxLength) {
      sanitized = sanitized.substring(0, rules.maxLength)
    }

    return sanitized
  }
}
```

### 2. Content Validation Service

```typescript
// services/content-validator.service.ts
@Injectable()
export class ContentValidatorService {
  constructor(
    private readonly fieldDefinitionRepository: FieldDefinitionRepository,
    private readonly textValidator: TextFieldValidator,
    private readonly numberValidator: NumberFieldValidator,
    private readonly dateValidator: DateFieldValidator,
    private readonly selectValidator: SelectFieldValidator,
    private readonly relationValidator: RelationFieldValidator,
    private readonly fileValidator: FileFieldValidator
    // ... other validators
  ) {}

  private getValidator(fieldType: FieldType): BaseFieldValidator {
    const validators = {
      [FieldType.TEXT]: this.textValidator,
      [FieldType.TEXTAREA]: this.textValidator,
      [FieldType.NUMBER]: this.numberValidator,
      [FieldType.DATE]: this.dateValidator,
      [FieldType.DATETIME]: this.dateValidator,
      [FieldType.SELECT]: this.selectValidator,
      [FieldType.MULTISELECT]: this.selectValidator,
      [FieldType.RELATION]: this.relationValidator,
      [FieldType.FILE]: this.fileValidator,
      [FieldType.IMAGE]: this.fileValidator
      // ... more mappings
    }

    return validators[fieldType]
  }

  async validateContent(
    postTypeId: string,
    fieldData: Record<string, any>
  ): Promise<ValidationResult> {
    // 1. Get field definitions for this post type
    const fieldDefinitions = await this.fieldDefinitionRepository.findByPostType(
      postTypeId
    )

    const errors: Record<string, string[]> = {}
    const sanitizedData: Record<string, any> = {}

    // 2. Validate each field
    for (const definition of fieldDefinitions) {
      const value = fieldData[definition.name]
      
      // Check conditional logic
      if (!this.shouldValidateField(definition, fieldData)) {
        continue
      }

      // Get appropriate validator
      const validator = this.getValidator(definition.fieldType)
      
      // Validate
      const result = await validator.validateValue(value, definition, fieldData)
      
      if (!result.isValid) {
        errors[definition.name] = result.errors
      } else {
        // Sanitize and store
        sanitizedData[definition.name] = validator.sanitizeValue(value, definition)
      }
    }

    // 3. Check for extra fields not in schema
    const allowedFields = fieldDefinitions.map(fd => fd.name)
    const extraFields = Object.keys(fieldData).filter(
      key => !allowedFields.includes(key)
    )

    if (extraFields.length > 0) {
      errors['_extra'] = [`Unknown fields: ${extraFields.join(', ')}`]
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      sanitizedData
    }
  }

  private shouldValidateField(
    definition: FieldDefinition,
    allValues: Record<string, any>
  ): boolean {
    if (!definition.conditionalLogic) return true

    const { show_if } = definition.conditionalLogic
    if (!show_if) return true

    const { fieldId, operator, value } = show_if

    // Find the target field definition
    const targetField = fieldDefinitions.find(fd => fd.id === fieldId)
    if (!targetField) return true

    const targetValue = allValues[targetField.name]

    // Apply operator logic
    switch (operator) {
      case 'equals':
        return targetValue === value
      case 'not_equals':
        return targetValue !== value
      case 'contains':
        return Array.isArray(targetValue) && targetValue.includes(value)
      case 'greater_than':
        return targetValue > value
      case 'less_than':
        return targetValue < value
      default:
        return true
    }
  }
}
```

### 3. Dynamic Query Builder

```typescript
// services/query-builder.service.ts
@Injectable()
export class QueryBuilderService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fieldDefinitionRepository: FieldDefinitionRepository
  ) {}

  async buildQuery(
    postTypeId: string,
    filters: QueryFilter[],
    sort?: SortOptions,
    pagination?: PaginationOptions
  ): Promise<SelectQueryBuilder<PostContent>> {
    const queryBuilder = this.dataSource
      .getRepository(PostContent)
      .createQueryBuilder('content')
      .where('content.post_type_id = :postTypeId', { postTypeId })
      .andWhere('content.deleted_at IS NULL')

    // Apply filters
    for (const filter of filters) {
      await this.applyFilter(queryBuilder, filter)
    }

    // Apply sorting
    if (sort) {
      this.applySort(queryBuilder, sort)
    }

    // Apply pagination
    if (pagination) {
      queryBuilder
        .skip(pagination.offset)
        .take(pagination.limit)
    }

    return queryBuilder
  }

  private async applyFilter(
    queryBuilder: SelectQueryBuilder<PostContent>,
    filter: QueryFilter
  ): Promise<void> {
    const { field, operator, value } = filter

    // Core fields (not in JSONB)
    if (['title', 'slug', 'status', 'author_id'].includes(field)) {
      this.applyCoreFieldFilter(queryBuilder, field, operator, value)
      return
    }

    // Custom fields (in JSONB)
    await this.applyCustomFieldFilter(queryBuilder, field, operator, value)
  }

  private applyCoreFieldFilter(
    queryBuilder: SelectQueryBuilder<PostContent>,
    field: string,
    operator: string,
    value: any
  ): void {
    const paramName = `${field}_${Date.now()}`

    switch (operator) {
      case 'equals':
        queryBuilder.andWhere(`content.${field} = :${paramName}`, { [paramName]: value })
        break
      case 'not_equals':
        queryBuilder.andWhere(`content.${field} != :${paramName}`, { [paramName]: value })
        break
      case 'contains':
        queryBuilder.andWhere(`content.${field} ILIKE :${paramName}`, {
          [paramName]: `%${value}%`
        })
        break
      case 'in':
        queryBuilder.andWhere(`content.${field} IN (:...${paramName})`, {
          [paramName]: value
        })
        break
      // ... more operators
    }
  }

  private async applyCustomFieldFilter(
    queryBuilder: SelectQueryBuilder<PostContent>,
    fieldName: string,
    operator: string,
    value: any
  ): Promise<void> {
    const paramName = `${fieldName}_${Date.now()}`

    // JSONB operators in PostgreSQL
    switch (operator) {
      case 'equals':
        queryBuilder.andWhere(
          `content.field_data->>'${fieldName}' = :${paramName}`,
          { [paramName]: String(value) }
        )
        break
      case 'not_equals':
        queryBuilder.andWhere(
          `content.field_data->>'${fieldName}' != :${paramName}`,
          { [paramName]: String(value) }
        )
        break
      case 'contains':
        queryBuilder.andWhere(
          `content.field_data->>'${fieldName}' ILIKE :${paramName}`,
          { [paramName]: `%${value}%` }
        )
        break
      case 'greater_than':
        queryBuilder.andWhere(
          `(content.field_data->>'${fieldName}')::numeric > :${paramName}`,
          { [paramName]: value }
        )
        break
      case 'less_than':
        queryBuilder.andWhere(
          `(content.field_data->>'${fieldName}')::numeric < :${paramName}`,
          { [paramName]: value }
        )
        break
      case 'in':
        // For array fields (multiselect, tags)
        queryBuilder.andWhere(
          `content.field_data->'${fieldName}' ?| ARRAY[:...${paramName}]`,
          { [paramName]: value }
        )
        break
      // ... more operators
    }
  }

  private applySort(
    queryBuilder: SelectQueryBuilder<PostContent>,
    sort: SortOptions
  ): void {
    const { field, direction } = sort

    // Core fields
    if (['title', 'created_at', 'published_at', 'view_count'].includes(field)) {
      queryBuilder.orderBy(`content.${field}`, direction.toUpperCase() as 'ASC' | 'DESC')
      return
    }

    // Custom fields (JSONB)
    queryBuilder.orderBy(
      `content.field_data->>'${field}'`,
      direction.toUpperCase() as 'ASC' | 'DESC'
    )
  }
}
```

### 4. Content Service (Main Business Logic)

```typescript
// services/content.service.ts
@Injectable()
export class ContentService {
  constructor(
    private readonly contentRepository: PostContentRepository,
    private readonly postTypeService: PostTypesService,
    private readonly validatorService: ContentValidatorService,
    private readonly queryBuilderService: QueryBuilderService,
    private readonly auditService: AuditService,
    private readonly cacheService: CacheService
  ) {}

  async create(
    postTypeSlug: string,
    createDto: CreateContentDto,
    userId: string
  ): Promise<PostContent> {
    // 1. Get post type
    const postType = await this.postTypeService.findBySlug(postTypeSlug)
    if (!postType) {
      throw new NotFoundException(`Post type '${postTypeSlug}' not found`)
    }

    // 2. Validate custom fields
    const validation = await this.validatorService.validateContent(
      postType.id,
      createDto.fieldData
    )

    if (!validation.isValid) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: validation.errors
      })
    }

    // 3. Generate slug if not provided
    const slug = createDto.slug || this.generateSlug(createDto.title)

    // 4. Create content instance
    const content = this.contentRepository.create({
      postTypeId: postType.id,
      title: createDto.title,
      slug,
      fieldData: validation.sanitizedData,
      excerpt: createDto.excerpt,
      status: createDto.status || ContentStatus.DRAFT,
      authorId: userId,
      createdBy: userId
    })

    // 5. Save to database
    const saved = await this.contentRepository.save(content)

    // 6. Handle relations (attachments, tags, categories)
    if (createDto.attachmentIds?.length > 0) {
      await this.contentRepository.attachFiles(saved.id, createDto.attachmentIds)
    }

    if (createDto.tagIds?.length > 0) {
      await this.contentRepository.attachTags(saved.id, createDto.tagIds)
    }

    // 7. Audit log
    await this.auditService.log({
      action: 'content.created',
      userId,
      resourceType: 'PostContent',
      resourceId: saved.id,
      details: { postType: postTypeSlug, title: saved.title }
    })

    // 8. Invalidate cache
    await this.cacheService.del(`content:${postTypeSlug}:list`)

    return saved
  }

  async findAll(
    postTypeSlug: string,
    queryDto: QueryContentDto
  ): Promise<{ data: PostContent[]; total: number }> {
    // 1. Check cache
    const cacheKey = `content:${postTypeSlug}:${JSON.stringify(queryDto)}`
    const cached = await this.cacheService.get(cacheKey)
    if (cached) {
      return cached
    }

    // 2. Get post type
    const postType = await this.postTypeService.findBySlug(postTypeSlug)
    if (!postType) {
      throw new NotFoundException(`Post type '${postTypeSlug}' not found`)
    }

    // 3. Build dynamic query
    const queryBuilder = await this.queryBuilderService.buildQuery(
      postType.id,
      queryDto.filters || [],
      queryDto.sort,
      queryDto.pagination
    )

    // 4. Execute query
    const [data, total] = await queryBuilder.getManyAndCount()

    const result = { data, total }

    // 5. Cache result (10 minutes)
    await this.cacheService.set(cacheKey, result, 600)

    return result
  }

  async update(
    postTypeSlug: string,
    contentId: string,
    updateDto: UpdateContentDto,
    userId: string
  ): Promise<PostContent> {
    // 1. Get existing content
    const content = await this.contentRepository.findById(contentId)
    if (!content || content.deletedAt) {
      throw new NotFoundException('Content not found')
    }

    // 2. Check post type
    const postType = await this.postTypeService.findBySlug(postTypeSlug)
    if (content.postTypeId !== postType.id) {
      throw new BadRequestException('Content does not belong to this post type')
    }

    // 3. Validate custom fields (only changed fields)
    if (updateDto.fieldData) {
      const validation = await this.validatorService.validateContent(
        postType.id,
        { ...content.fieldData, ...updateDto.fieldData }
      )

      if (!validation.isValid) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: validation.errors
        })
      }

      content.fieldData = validation.sanitizedData
    }

    // 4. Update core fields
    if (updateDto.title) content.title = updateDto.title
    if (updateDto.slug) content.slug = updateDto.slug
    if (updateDto.excerpt !== undefined) content.excerpt = updateDto.excerpt
    if (updateDto.status) content.status = updateDto.status

    content.updatedBy = userId
    content.version += 1

    // 5. Save
    const updated = await this.contentRepository.save(content)

    // 6. Audit log
    await this.auditService.log({
      action: 'content.updated',
      userId,
      resourceType: 'PostContent',
      resourceId: updated.id,
      details: { postType: postTypeSlug, changes: updateDto }
    })

    // 7. Invalidate cache
    await this.cacheService.del(`content:${postTypeSlug}:${contentId}`)
    await this.cacheService.del(`content:${postTypeSlug}:list`)

    return updated
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }
}
```

---

## 📡 API Endpoints

### Post Types Management

```
POST   /api/v1/post-types              Create post type (admin only)
GET    /api/v1/post-types              List all post types
GET    /api/v1/post-types/:slug        Get post type by slug
PATCH  /api/v1/post-types/:slug        Update post type (admin only)
DELETE /api/v1/post-types/:slug        Delete post type (admin only)
```

### Field Definitions Management

```
POST   /api/v1/post-types/:slug/fields       Add field to post type
GET    /api/v1/post-types/:slug/fields       List fields for post type
GET    /api/v1/post-types/:slug/fields/:id   Get single field definition
PATCH  /api/v1/post-types/:slug/fields/:id   Update field definition
DELETE /api/v1/post-types/:slug/fields/:id   Delete field definition
POST   /api/v1/post-types/:slug/fields/reorder  Reorder fields
```

### Content Management (Dynamic)

```
POST   /api/v1/content/:postType         Create content instance
GET    /api/v1/content/:postType         Query content (with filters)
GET    /api/v1/content/:postType/:id     Get single content
PATCH  /api/v1/content/:postType/:id     Update content
DELETE /api/v1/content/:postType/:id     Delete content (soft delete)
POST   /api/v1/content/:postType/:id/publish    Publish content
POST   /api/v1/content/:postType/:id/attachments  Attach files
GET    /api/v1/content/:postType/:id/attachments  List attachments
DELETE /api/v1/content/:postType/:id/attachments/:attachmentId  Detach file
```

### Advanced Queries

```
POST   /api/v1/content/:postType/query   Advanced query with filters
GET    /api/v1/content/:postType/export  Export data (CSV/JSON)
POST   /api/v1/content/:postType/import  Import data (bulk)
GET    /api/v1/content/:postType/stats   Statistics
```

---

## 🔒 Security & ACL Integration

### Permission System

Define permissions per post type:

```typescript
// Example permissions for "Event" post type
{
  action: Action.Create,
  subject: 'PostContent',
  conditions: { 'fieldData.postType': 'event' }
}

{
  action: Action.Update,
  subject: 'PostContent',
  conditions: { 
    'fieldData.postType': 'event',
    authorId: '${userId}' // Can only update own events
  }
}
```

### Field-Level Permissions

```typescript
// In FieldDefinition entity
@Column({ type: 'simple-array', nullable: true })
editableByRoles?: string[] // ['admin', 'editor']

@Column({ type: 'simple-array', nullable: true })
visibleToRoles?: string[] // ['admin', 'editor', 'user']
```

### Implementation in Controller

```typescript
@Controller('content/:postTypeSlug')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class ContentController {
  @Post()
  @CheckAbilities({ 
    action: Action.Create, 
    subject: 'PostContent' 
  })
  async create(
    @Param('postTypeSlug') postTypeSlug: string,
    @Body() createDto: CreateContentDto,
    @CurrentUser() user: User
  ) {
    // Check post-type-specific permissions
    await this.checkPostTypePermission(user, postTypeSlug, Action.Create)
    
    return this.contentService.create(postTypeSlug, createDto, user.id)
  }

  private async checkPostTypePermission(
    user: User,
    postTypeSlug: string,
    action: Action
  ): Promise<void> {
    const postType = await this.postTypeService.findBySlug(postTypeSlug)
    
    const ability = await this.abilityFactory.createForUser(user)
    const can = ability.can(action, {
      __typename: 'PostContent',
      postTypeId: postType.id
    })

    if (!can) {
      throw new ForbiddenException(
        `You don't have permission to ${action} ${postTypeSlug}`
      )
    }
  }
}
```

---

## 🚀 Implementation Phases

### Phase 1: Core Schema & Entities (Week 1)
**Duration**: 5-7 days  
**Priority**: Critical

**Tasks**:
- [ ] Create database migrations (4 tables + enums)
- [ ] Create entities (PostType, FieldDefinition, PostContent)
- [ ] Create repositories with caching
- [ ] Basic CRUD services
- [ ] Unit tests for entities

**Deliverables**:
- Working database schema
- Basic CRUD operations
- 80%+ test coverage

### Phase 2: Field Type System (Week 2)
**Duration**: 5-7 days  
**Priority**: High

**Tasks**:
- [ ] Implement field validators (10+ types)
- [ ] Create ContentValidatorService
- [ ] Schema validation logic
- [ ] Conditional logic engine
- [ ] Unit tests for each validator

**Deliverables**:
- Complete field validation system
- 15+ field types supported
- Conditional logic working

### Phase 3: API Layer & Controllers (Week 2-3)
**Duration**: 5-7 days  
**Priority**: High

**Tasks**:
- [ ] PostTypesController (5 endpoints)
- [ ] FieldDefinitionsController (6 endpoints)
- [ ] ContentController (8+ endpoints)
- [ ] DTOs with validation
- [ ] Swagger documentation
- [ ] Integration tests

**Deliverables**:
- 19+ REST endpoints
- Complete API documentation
- Integration tests passing

### Phase 4: Query System (Week 3)
**Duration**: 3-5 days  
**Priority**: Medium

**Tasks**:
- [ ] QueryBuilderService implementation
- [ ] JSONB query optimization
- [ ] Full-text search integration
- [ ] Aggregation support
- [ ] Performance testing

**Deliverables**:
- Dynamic query system
- < 100ms query response time
- Full-text search working

### Phase 5: ACL & Permissions (Week 4)
**Duration**: 3-4 days  
**Priority**: High

**Tasks**:
- [ ] Post-type-specific permissions
- [ ] Field-level permissions
- [ ] AbilityGuard integration
- [ ] Permission seeder
- [ ] ACL testing

**Deliverables**:
- Complete permission system
- Field-level access control
- ACL tests passing

### Phase 6: Advanced Features (Week 4-5)
**Duration**: 5-7 days  
**Priority**: Medium

**Tasks**:
- [ ] Import/export utilities
- [ ] Bulk operations
- [ ] Content versioning
- [ ] Search optimization
- [ ] Performance tuning

**Deliverables**:
- Import/export working
- Bulk operations API
- Performance benchmarks

### Phase 7: Documentation & Testing (Week 5)
**Duration**: 3-4 days  
**Priority**: High

**Tasks**:
- [ ] Complete API documentation
- [ ] Frontend integration guide
- [ ] Migration guide from Stories
- [ ] Performance testing
- [ ] Security audit

**Deliverables**:
- Complete documentation
- Frontend integration guide
- Security audit report

---

## 📊 Performance Targets

### Database Performance

- **Schema queries**: < 50ms (cached)
- **Content queries**: < 100ms (simple), < 300ms (complex)
- **Bulk operations**: 100+ records/second
- **Full-text search**: < 200ms

### Caching Strategy

```typescript
// Post types: 30-minute cache (rarely change)
await cacheService.set(`post-type:${slug}`, postType, 1800)

// Field definitions: 15-minute cache
await cacheService.set(`fields:${postTypeId}`, fields, 900)

// Content list: 5-minute cache
await cacheService.set(`content:${postTypeSlug}:list`, data, 300)

// Single content: 10-minute cache
await cacheService.set(`content:${id}`, content, 600)
```

### Indexes

```sql
-- Critical indexes for performance
CREATE INDEX idx_post_content_field_data ON post_content USING GIN(field_data);
CREATE INDEX idx_post_content_search ON post_content USING GIN(
  to_tsvector('english', title || ' ' || COALESCE(excerpt, ''))
);
CREATE INDEX idx_field_definitions_post_type_order ON field_definitions(post_type_id, display_order);
CREATE INDEX idx_post_content_post_type_status ON post_content(post_type_id, status);
CREATE INDEX idx_post_content_published ON post_content(published_at DESC) WHERE status = 'published';
```

---

## 🧪 Testing Strategy

### Unit Tests

- [ ] Entity validation tests
- [ ] Repository tests (mocked DB)
- [ ] Service tests (mocked dependencies)
- [ ] Validator tests (each field type)
- [ ] Query builder tests

**Target**: 85%+ code coverage

### Integration Tests

- [ ] API endpoint tests
- [ ] Database integration tests
- [ ] ACL integration tests
- [ ] Cache integration tests
- [ ] Full workflow tests

**Target**: All critical paths covered

### E2E Tests

- [ ] Create post type → add fields → create content
- [ ] Query content with filters
- [ ] Update content with validation
- [ ] Permission checks
- [ ] Import/export workflow

**Target**: 5-10 key scenarios

---

## 📚 Documentation Deliverables

### Technical Documentation

1. **API Reference** (`docs/features/post-types/API_REFERENCE.md`)
   - All endpoints with examples
   - Request/response schemas
   - Error codes

2. **Field Type Reference** (`docs/features/post-types/FIELD_TYPES.md`)
   - All 15+ field types
   - Validation rules
   - Configuration options

3. **Query API Guide** (`docs/features/post-types/QUERY_API.md`)
   - Filter operators
   - Sort options
   - Pagination examples

4. **ACL Integration** (`docs/features/post-types/ACL_INTEGRATION.md`)
   - Permission examples
   - Field-level security
   - Role-based access

### Frontend Integration

5. **Frontend Guide** (`docs/features/post-types/FRONTEND_GUIDE.md`)
   - Schema fetching
   - Dynamic form generation
   - Content CRUD examples
   - TypeScript types

6. **Migration Guide** (`docs/features/post-types/MIGRATION_FROM_STORIES.md`)
   - How to migrate existing Stories
   - Data migration scripts
   - Breaking changes

---

## 🔄 Migration from Existing Stories

### Strategy

Instead of migrating immediately, run parallel:

1. **Keep Stories Module** (for backward compatibility)
2. **Create "Story" Post Type** in new system
3. **Sync data** (background job)
4. **Deprecate Stories module** after 2 releases

### Data Migration Script

```typescript
// scripts/migrate-stories-to-post-types.ts
async function migrateStories() {
  // 1. Create "Story" post type
  const storyPostType = await postTypeService.create({
    name: 'Story',
    slug: 'story',
    singularLabel: 'Story',
    pluralLabel: 'Stories',
    isHierarchical: true,
    supportsRevisions: true
  })

  // 2. Create field definitions matching Story entity
  await fieldDefinitionService.createMany(storyPostType.id, [
    { name: 'details', fieldType: FieldType.TEXTAREA, label: 'Details' },
    { name: 'type', fieldType: FieldType.SELECT, label: 'Type', 
      fieldOptions: { choices: ['TIP_OFF', 'STORY', 'REPORT'] } },
    { name: 'priority', fieldType: FieldType.SELECT, label: 'Priority',
      fieldOptions: { choices: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] } },
    { name: 'fromTime', fieldType: FieldType.DATETIME, label: 'From Time' },
    { name: 'toTime', fieldType: FieldType.DATETIME, label: 'To Time' },
    // ... more fields
  ])

  // 3. Migrate data
  const stories = await storyRepository.findAll()
  
  for (const story of stories) {
    await contentService.create('story', {
      title: story.title,
      slug: story.id.toString(), // Keep old ID as slug
      fieldData: {
        details: story.details,
        type: story.type,
        priority: story.priority,
        fromTime: story.fromTime,
        toTime: story.toTime,
        // ... more fields
      },
      status: mapStoryStatus(story.status),
      authorId: story.userId,
      publishedAt: story.publishedAt
    }, 'system')
  }

  console.log(`Migrated ${stories.length} stories`)
}
```

---

## 🎨 Frontend Examples

### Fetching Post Type Schema

```typescript
// Example: Get "Event" post type schema
const response = await fetch('/api/v1/post-types/event')
const postType = await response.json()

// Get field definitions
const fieldsResponse = await fetch('/api/v1/post-types/event/fields')
const fields = await fieldsResponse.json()

// Generate dynamic form
const formSchema = fields.data.map(field => ({
  name: field.name,
  type: field.fieldType,
  label: field.label,
  required: field.isRequired,
  validation: field.validationRules,
  options: field.fieldOptions
}))
```

### Creating Content

```typescript
// Create an event
const createEvent = async (eventData) => {
  const response = await fetch('/api/v1/content/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: eventData.title,
      fieldData: {
        event_date: eventData.eventDate,
        location: eventData.location,
        max_attendees: eventData.maxAttendees,
        registration_url: eventData.registrationUrl
      },
      status: 'draft',
      tagIds: eventData.tags,
      attachmentIds: eventData.images
    })
  })

  return response.json()
}
```

### Querying Content

```typescript
// Query events with filters
const queryEvents = async (filters) => {
  const response = await fetch('/api/v1/content/event', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filters: [
        {
          field: 'event_date',
          operator: 'greater_than',
          value: new Date().toISOString()
        },
        {
          field: 'location',
          operator: 'contains',
          value: 'New York'
        }
      ],
      sort: { field: 'event_date', direction: 'asc' },
      pagination: { page: 1, limit: 20 }
    })
  })

  return response.json()
}
```

---

## 🚨 Risks & Mitigation

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **JSONB Performance** | High | Medium | Proper indexing (GIN), query optimization, caching |
| **Schema Complexity** | Medium | High | Clear documentation, validation helpers, examples |
| **Data Migration** | High | Low | Parallel run, thorough testing, rollback plan |
| **Security** | High | Medium | Field-level ACL, input sanitization, audit logging |
| **Frontend Complexity** | Medium | High | Comprehensive guide, TypeScript types, examples |

### Mitigation Strategies

1. **Performance**:
   - Benchmark early (Week 2)
   - Use EXPLAIN ANALYZE for all queries
   - Implement aggressive caching
   - Consider ElasticSearch for search-heavy use cases

2. **Complexity**:
   - Start with 5-7 core field types
   - Add advanced types incrementally
   - Provide simple examples first
   - Build helper utilities

3. **Data Safety**:
   - Keep Stories module running
   - Background sync for testing
   - Feature flag for gradual rollout
   - Comprehensive backups

---

## ✅ Success Criteria

### Functional

- [ ] Can create post types via API
- [ ] Can add 15+ field types to post types
- [ ] Field validation works correctly
- [ ] Can create/read/update/delete content
- [ ] Queries return correct results
- [ ] ACL integration works
- [ ] Import/export functional

### Performance

- [ ] Schema queries < 50ms (cached)
- [ ] Content queries < 100ms (simple)
- [ ] Handles 10,000+ content items
- [ ] Cache hit rate > 80%

### Quality

- [ ] 85%+ test coverage
- [ ] Zero security vulnerabilities
- [ ] Complete API documentation
- [ ] Frontend integration guide

---

## 📅 Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Core Schema | Week 1 | Database + Entities |
| Phase 2: Field Types | Week 2 | Validation System |
| Phase 3: API Layer | Week 2-3 | REST Endpoints |
| Phase 4: Query System | Week 3 | Dynamic Queries |
| Phase 5: ACL | Week 4 | Permissions |
| Phase 6: Advanced | Week 4-5 | Import/Export |
| Phase 7: Docs & Testing | Week 5 | Documentation |

**Total Estimate**: 4-5 weeks (1 developer, full-time)

---

## 🎯 Next Steps

1. **Review this plan** with team
2. **Create new branch**: `feature/dynamic-post-types` ✅ (DONE)
3. **Start Phase 1**: Database migrations
4. **Weekly check-ins** to track progress
5. **Update ENTERPRISE_PROGRESS.md** as we go

---

## 📞 Questions to Resolve

1. **Do we need ElasticSearch integration** for full-text search, or is PostgreSQL enough?
2. **Should we support nested/repeater fields** (fields within fields) in Phase 1?
3. **Do we want content versioning** (like story versions) from the start?
4. **Should we build a visual form builder** for the dashboard, or just API?
5. **Migration timeline** - when to deprecate Stories module?

---

**Document Status**: ✅ Complete  
**Last Updated**: 2025-11-17  
**Author**: GitHub Copilot  
**Next Review**: After Phase 1 completion
