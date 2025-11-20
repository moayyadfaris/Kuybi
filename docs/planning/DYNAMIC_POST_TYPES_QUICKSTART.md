# Dynamic Post Types - Quick Start Guide

## Overview

Build a WordPress + ACF-like system where you can dynamically define custom post types (like "Event", "Product", "Recipe") and attach custom fields to each type. The backend handles schema validation, storage, and querying.

**Branch**: `feature/dynamic-post-types` ✅  
**Duration**: 4-5 weeks  
**Status**: Planning complete, ready to implement

---

## 🎯 What You're Building

### User Story

> **As a frontend developer**, I want to define custom content types (like "Event" or "Product") through the API, add custom fields to them (like "event_date" or "price"), and then create/query instances of those types - all without backend changes.

### Example Flow

```typescript
// 1. Define "Event" post type
POST /api/v1/post-types
{
  "name": "Event",
  "slug": "event",
  "singularLabel": "Event",
  "pluralLabel": "Events"
}

// 2. Add custom fields
POST /api/v1/post-types/event/fields
{
  "name": "event_date",
  "fieldType": "date",
  "label": "Event Date",
  "isRequired": true
}

POST /api/v1/post-types/event/fields
{
  "name": "max_attendees",
  "fieldType": "number",
  "label": "Max Attendees",
  "validationRules": { "min": 1, "max": 10000 }
}

// 3. Create an event
POST /api/v1/content/event
{
  "title": "Tech Conference 2025",
  "fieldData": {
    "event_date": "2025-12-01",
    "max_attendees": 500
  }
}

// 4. Query events
GET /api/v1/content/event?filters=[{"field":"event_date","operator":"greater_than","value":"2025-11-01"}]
```

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────┐
│         POST TYPES (Schema)             │
│  Define what types exist (Event, etc.)  │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│      FIELD DEFINITIONS (Schema)         │
│  Define fields for each type            │
│  (event_date, location, etc.)           │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│        POST CONTENT (Data)              │
│  Actual instances of the types          │
│  field_data stored as JSONB             │
└─────────────────────────────────────────┘
```

---

## 📊 Database Tables

### 1. `post_types` - Type Definitions

```sql
id, name, slug, description, singular_label, plural_label,
is_hierarchical, supports_comments, is_active, settings (JSONB)
```

### 2. `field_definitions` - Field Schemas

```sql
id, post_type_id, name, label, field_type,
validation_rules (JSONB), field_options (JSONB),
is_required, is_unique, conditional_logic (JSONB)
```

### 3. `post_content` - Data Instances

```sql
id, post_type_id, title, slug,
field_data (JSONB), -- ← All custom fields here
status, author_id, published_at
```

**Key Design**: Custom field values stored in `field_data` JSONB column with GIN index for fast queries.

---

## 🔧 15+ Field Types

| Type | Example | Validation |
|------|---------|------------|
| **text** | Short text | minLength, maxLength, pattern |
| **textarea** | Long text | maxLength |
| **number** | 99.99 | min, max, integer, decimal |
| **email** | user@example.com | Email format |
| **url** | https://example.com | URL format |
| **date** | 2025-12-01 | Date range, format |
| **datetime** | 2025-12-01T10:00:00Z | Datetime range |
| **checkbox** | true/false | Boolean |
| **select** | "option1" | choices list |
| **multiselect** | ["opt1", "opt2"] | choices list, min/max |
| **file** | attachment_id | File type, size |
| **image** | attachment_id | Image dimensions, format |
| **relation** | other_content_id | Target post type |
| **user** | user_id | User exists |
| **color** | #FF5733 | Hex color format |

---

## 🚀 Implementation Phases

### **Week 1: Core Foundation**
- Create 4 database tables
- Build entities (PostType, FieldDefinition, PostContent)
- Create repositories with caching
- Basic CRUD services

### **Week 2: Field Validators**
- Implement 15+ field type validators
- ContentValidatorService
- Conditional logic engine

### **Week 2-3: API Layer**
- 19+ REST endpoints
- Controllers + DTOs
- Swagger documentation

### **Week 3: Query System**
- Dynamic query builder
- JSONB filter support
- Full-text search

### **Week 4: ACL Integration**
- Post-type permissions
- Field-level permissions
- Role-based access

### **Week 4-5: Advanced Features**
- Import/export
- Bulk operations
- Performance tuning

### **Week 5: Documentation**
- API docs
- Frontend guide
- Migration guide

---

## 📡 Key API Endpoints

### Post Type Management
```
POST   /api/v1/post-types              Create type
GET    /api/v1/post-types              List types
GET    /api/v1/post-types/:slug        Get type
PATCH  /api/v1/post-types/:slug        Update type
DELETE /api/v1/post-types/:slug        Delete type
```

### Field Management
```
POST   /api/v1/post-types/:slug/fields       Add field
GET    /api/v1/post-types/:slug/fields       List fields
PATCH  /api/v1/post-types/:slug/fields/:id   Update field
DELETE /api/v1/post-types/:slug/fields/:id   Delete field
```

### Content Management (Dynamic per type)
```
POST   /api/v1/content/:postType         Create instance
GET    /api/v1/content/:postType         Query instances
GET    /api/v1/content/:postType/:id     Get instance
PATCH  /api/v1/content/:postType/:id     Update instance
DELETE /api/v1/content/:postType/:id     Delete instance
```

---

## 🔍 Example: "Event" Post Type

### Step 1: Create Post Type

```bash
curl -X POST http://localhost:4040/api/v1/post-types \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Event",
    "slug": "event",
    "singularLabel": "Event",
    "pluralLabel": "Events",
    "description": "Community events and meetups",
    "isHierarchical": false,
    "supportsComments": true,
    "isActive": true
  }'
```

### Step 2: Add Fields

```bash
# Event Date
curl -X POST http://localhost:4040/api/v1/post-types/event/fields \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "event_date",
    "label": "Event Date",
    "fieldType": "date",
    "isRequired": true,
    "isSearchable": true,
    "validationRules": {
      "minDate": "2025-01-01"
    }
  }'

# Location
curl -X POST http://localhost:4040/api/v1/post-types/event/fields \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "location",
    "label": "Location",
    "fieldType": "text",
    "isRequired": true,
    "validationRules": {
      "maxLength": 200
    }
  }'

# Max Attendees
curl -X POST http://localhost:4040/api/v1/post-types/event/fields \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "max_attendees",
    "label": "Maximum Attendees",
    "fieldType": "number",
    "isRequired": false,
    "validationRules": {
      "min": 1,
      "max": 10000,
      "integer": true
    }
  }'
```

### Step 3: Create Event Instance

```bash
curl -X POST http://localhost:4040/api/v1/content/event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Tech Conference 2025",
    "slug": "tech-conference-2025",
    "fieldData": {
      "event_date": "2025-12-01",
      "location": "New York City",
      "max_attendees": 500
    },
    "status": "published",
    "tagIds": ["uuid-1", "uuid-2"]
  }'
```

### Step 4: Query Events

```bash
# Get all upcoming events
curl -X GET "http://localhost:4040/api/v1/content/event?filters=[{\"field\":\"event_date\",\"operator\":\"greater_than\",\"value\":\"2025-11-01\"}]&sort={\"field\":\"event_date\",\"direction\":\"asc\"}" \
  -H "Authorization: Bearer $TOKEN"

# Search by location
curl -X GET "http://localhost:4040/api/v1/content/event?filters=[{\"field\":\"location\",\"operator\":\"contains\",\"value\":\"New York\"}]" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 💡 Frontend Integration

### Fetch Schema

```typescript
// Get post type + fields
const schema = await fetch('/api/v1/post-types/event').then(r => r.json())
const fields = await fetch('/api/v1/post-types/event/fields').then(r => r.json())

// Generate form dynamically
const formConfig = fields.data.map(field => ({
  name: field.name,
  type: field.fieldType,
  label: field.label,
  required: field.isRequired,
  validation: field.validationRules
}))
```

### Create Content

```typescript
const createEvent = async (data) => {
  const response = await fetch('/api/v1/content/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title: data.title,
      fieldData: {
        event_date: data.eventDate,
        location: data.location,
        max_attendees: data.maxAttendees
      },
      status: 'draft'
    })
  })
  return response.json()
}
```

---

## ⚡ Performance

### Targets
- Schema queries: **< 50ms** (cached)
- Content queries: **< 100ms** (simple)
- Bulk operations: **100+ records/second**
- Cache hit rate: **> 80%**

### Optimization
```sql
-- GIN index for JSONB queries
CREATE INDEX idx_post_content_field_data ON post_content USING GIN(field_data);

-- Full-text search
CREATE INDEX idx_post_content_search ON post_content USING GIN(
  to_tsvector('english', title || ' ' || COALESCE(excerpt, ''))
);
```

---

## 🔒 Security (ACL)

### Post-Type Permissions

```typescript
// Permission to create events
{
  action: Action.Create,
  subject: 'PostContent',
  conditions: { postTypeSlug: 'event' }
}

// Can only edit own events
{
  action: Action.Update,
  subject: 'PostContent',
  conditions: { 
    postTypeSlug: 'event',
    authorId: '${userId}'
  }
}
```

### Field-Level Permissions

```typescript
// Only admins can edit "featured" field
FieldDefinition {
  name: 'featured',
  editableByRoles: ['admin'],
  visibleToRoles: ['admin', 'editor', 'user']
}
```

---

## 📁 Module Structure

```
src/modules/post-types/
├── controllers/
│   ├── post-types.controller.ts
│   ├── field-definitions.controller.ts
│   └── content.controller.ts
├── services/
│   ├── post-types.service.ts
│   ├── field-definitions.service.ts
│   ├── content.service.ts
│   ├── content-validator.service.ts
│   └── query-builder.service.ts
├── entities/
│   ├── post-type.entity.ts
│   ├── field-definition.entity.ts
│   └── post-content.entity.ts
├── validators/
│   ├── text-field.validator.ts
│   ├── number-field.validator.ts
│   ├── date-field.validator.ts
│   └── ... (15+ validators)
├── dto/
│   ├── post-types/
│   ├── field-definitions/
│   └── content/
└── migrations/
    ├── 1700000000000-CreatePostTypesTable.ts
    ├── 1700000000001-CreateFieldDefinitionsTable.ts
    └── 1700000000002-CreatePostContentTable.ts
```

---

## ✅ Success Criteria

- [ ] Can create post types via API
- [ ] Can add 15+ field types
- [ ] Field validation works correctly
- [ ] Can CRUD content instances
- [ ] Dynamic queries work (< 100ms)
- [ ] ACL integration functional
- [ ] 85%+ test coverage
- [ ] Complete documentation

---

## 🚦 Getting Started

### 1. Review Full Plan
Read `docs/planning/DYNAMIC_POST_TYPES_PLAN.md` for complete details.

### 2. Start Phase 1 (Week 1)
```bash
# Switch to feature branch
git checkout feature/dynamic-post-types

# Create migration files
npm run migration:create -- CreatePostTypesTable
npm run migration:create -- CreateFieldDefinitionsTable
npm run migration:create -- CreatePostContentTable

# Create entities
mkdir -p src/modules/post-types/entities
touch src/modules/post-types/entities/post-type.entity.ts
touch src/modules/post-types/entities/field-definition.entity.ts
touch src/modules/post-types/entities/post-content.entity.ts
```

### 3. Track Progress
Update `docs/progress/ENTERPRISE_PROGRESS.md` weekly.

---

## 📞 Questions?

Refer to:
- **Full Plan**: `docs/planning/DYNAMIC_POST_TYPES_PLAN.md` (2,000+ lines)
- **Progress Tracking**: `docs/progress/ENTERPRISE_PROGRESS.md`
- **Architecture Guide**: `docs/architecture/DOMAIN_DRIVEN_DESIGN.md`

---

**Ready to build!** 🚀
