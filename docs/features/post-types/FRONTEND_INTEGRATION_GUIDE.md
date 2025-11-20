# Dynamic Post Types - Frontend Integration Guide

**Version:** 1.0.0  
**Last Updated:** November 19, 2025  
**Status:** Phase 1 Complete - Phase 2 APIs Coming Soon

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Current Status](#current-status)
3. [Database Schema](#database-schema)
4. [Data Models](#data-models)
5. [Available APIs (Phase 2)](#available-apis-phase-2)
6. [Authentication](#authentication)
7. [Implementation Examples](#implementation-examples)
8. [State Management](#state-management)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)

---

## 🎯 Overview

The Dynamic Post Types system provides WordPress + ACF-like flexibility for creating custom content types (Events, Products, Recipes, etc.) with custom fields.

### What You Can Build:
- **Post Type Management:** Create/edit custom content types (Event, Product, Recipe)
- **Field Builder:** Define custom fields for each post type (text, date, wysiwyg, etc.)
- **Content Management:** Create content instances with dynamic fields
- **Field Validation:** Real-time validation based on field definitions
- **Search & Filter:** Full-text search + JSONB field queries

### Key Features:
- ✅ 25 field types (text, number, date, wysiwyg, file, relation, etc.)
- ✅ 6 content statuses (draft, pending_review, published, scheduled, archived, deleted)
- ✅ JSONB storage for maximum flexibility
- ✅ Full-text search with PostgreSQL tsvector
- ✅ Redis caching (30-min for types, 15-min for fields, 10-min for content)
- ✅ System post types (protected, cannot be deleted)
- ✅ Custom post types (user-created, can be modified/deleted)

---

## 🚧 Current Status

### ✅ Phase 1 Complete (Backend Infrastructure):
- Database tables with JSONB columns
- TypeORM entities with relationships
- Repository layer with caching
- Service layer with business logic
- Seeded data: Story (system) + Event (custom) post types

### ⏳ Phase 2 In Progress (REST API):
- Controllers with RESTful endpoints
- DTOs with validation decorators
- Swagger/OpenAPI documentation
- ACL integration (role-based permissions)

### 📅 Expected API Availability: **December 1, 2025**

---

## 🗄️ Database Schema

### Tables Overview

```
post_types (Post Type Definitions)
  └── field_definitions (Field Schemas)
        └── post_content (Content Instances)
              ├── post_content_attachments (Many-to-Many)
              ├── post_content_tags (Many-to-Many)
              └── post_content_categories (Many-to-Many)
```

### Post Types Table

```sql
post_types:
  - id: uuid (primary key)
  - name: string (unique, e.g., "Event", "Product")
  - slug: string (unique, e.g., "event", "product")
  - singularLabel: string (e.g., "Event")
  - pluralLabel: string (e.g., "Events")
  - description: text
  - icon: string (optional)
  - menuIcon: string (for navigation)
  - menuPosition: integer (sort order)
  - isHierarchical: boolean (supports parent-child)
  - supportsComments: boolean
  - supportsRevisions: boolean
  - showInRest: boolean (API exposure)
  - restBase: string (API endpoint path)
  - capabilityType: string (ACL integration)
  - isActive: boolean
  - isSystem: boolean (protected, cannot delete)
  - settings: jsonb (flexible configuration)
  - createdBy: uuid (user reference)
  - updatedBy: uuid (user reference)
  - createdAt: timestamp
  - updatedAt: timestamp
  - deletedAt: timestamp (soft delete)
  - version: integer (optimistic locking)
```

### Field Definitions Table

```sql
field_definitions:
  - id: uuid (primary key)
  - postTypeId: uuid (foreign key to post_types)
  - name: string (snake_case, e.g., "event_date")
  - label: string (human-readable, e.g., "Event Date")
  - fieldType: enum (25 types - see Field Types section)
  - description: text
  - defaultValue: string (stored as string, cast by type)
  - placeholder: string
  - isRequired: boolean
  - isUnique: boolean (enforced at app level)
  - isSearchable: boolean (included in full-text search)
  - isFilterable: boolean (can query by this field)
  - isSortable: boolean (can order by this field)
  - displayOrder: integer (field order in forms)
  - fieldGroup: string (optional grouping)
  - helpText: text
  - validationRules: jsonb (minLength, maxLength, min, max, pattern, etc.)
  - fieldOptions: jsonb (type-specific config: choices, format, etc.)
  - conditionalLogic: jsonb (show/hide rules - Phase 2)
  - createdAt: timestamp
  - updatedAt: timestamp
  - deletedAt: timestamp
```

### Post Content Table

```sql
post_content:
  - id: uuid (primary key)
  - postTypeId: uuid (foreign key to post_types)
  - authorId: uuid (foreign key to users)
  - parentId: uuid (self-reference for hierarchical content)
  - title: string (required)
  - slug: string (unique per post type)
  - excerpt: text (short description)
  - status: enum (draft, pending_review, published, scheduled, archived, deleted)
  - publishedAt: timestamp
  - scheduledFor: timestamp
  - field_data: jsonb (ALL custom field values stored here)
  - metadata: jsonb (SEO, custom metadata)
  - viewCount: integer
  - likeCount: integer
  - commentCount: integer
  - shareCount: integer
  - hierarchyPath: string (materialized path for hierarchical queries)
  - searchVector: tsvector (full-text search)
  - createdBy: uuid
  - updatedBy: uuid
  - createdAt: timestamp
  - updatedAt: timestamp
  - deletedAt: timestamp
  - version: integer
```

---

## 📦 Data Models

### Field Types (25 Types)

```typescript
enum FieldType {
  // Text Fields
  TEXT = 'text',           // Short text input (minLength, maxLength)
  TEXTAREA = 'textarea',   // Multi-line text (rows, maxLength)
  WYSIWYG = 'wysiwyg',    // Rich text editor (toolbar config)
  EMAIL = 'email',         // Email validation
  URL = 'url',            // URL validation
  TEL = 'tel',            // Phone number validation
  CODE = 'code',          // Code editor (language, theme)
  
  // Number Fields
  NUMBER = 'number',       // Integer or float (min, max, step)
  CURRENCY = 'currency',   // Money (currency, decimals, prefix/suffix)
  
  // Date/Time Fields
  DATE = 'date',          // Date picker (format, min, max)
  DATETIME = 'datetime',  // Date + time picker
  TIME = 'time',          // Time picker
  
  // Choice Fields
  CHECKBOX = 'checkbox',        // True/false
  RADIO = 'radio',             // Single choice (choices array)
  SELECT = 'select',           // Dropdown (choices, allowOther)
  MULTISELECT = 'multiselect', // Multiple choices
  TOGGLE = 'toggle',           // On/off switch
  
  // Media Fields
  FILE = 'file',          // File upload (allowedTypes, maxSize)
  IMAGE = 'image',        // Image upload (dimensions, crop)
  GALLERY = 'gallery',    // Multiple images (min, max)
  VIDEO = 'video',        // Video upload or embed
  
  // Relational Fields
  RELATION = 'relation',  // Link to other content (postTypeId, multiple)
  USER = 'user',          // Link to users (multiple, roles)
  TAXONOMY = 'taxonomy',  // Link to categories/tags
  
  // Advanced Fields
  COLOR = 'color',        // Color picker (format: hex, rgb, hsl)
  JSON = 'json',          // Raw JSON editor
  REPEATER = 'repeater',  // Repeating sub-fields (Phase 2)
  GROUP = 'group'         // Field group (Phase 2)
}
```

### Content Status (6 Statuses)

```typescript
enum ContentStatus {
  DRAFT = 'draft',                 // Being edited, not visible
  PENDING_REVIEW = 'pending_review', // Submitted for approval
  PUBLISHED = 'published',         // Live and visible
  SCHEDULED = 'scheduled',         // Will be published at scheduledFor
  ARCHIVED = 'archived',           // Hidden but kept for history
  DELETED = 'deleted'              // Soft deleted
}
```

---

## 🔌 Available APIs (Phase 2)

> **Note:** These endpoints will be available in Phase 2 (expected December 1, 2025).  
> Base URL: `http://localhost:4000/api`

### Post Types Endpoints

#### 1. Get All Post Types
```http
GET /api/post-types
Query Parameters:
  - includeInactive: boolean (default: false)
  
Response: 200 OK
[
  {
    "id": "uuid",
    "name": "Event",
    "slug": "event",
    "singularLabel": "Event",
    "pluralLabel": "Events",
    "description": "Calendar events with dates, locations, and attendance management",
    "icon": "calendar",
    "menuIcon": "calendar",
    "menuPosition": 6,
    "isHierarchical": false,
    "supportsComments": true,
    "supportsRevisions": true,
    "showInRest": true,
    "restBase": "events",
    "capabilityType": "event",
    "isActive": true,
    "isSystem": false,
    "settings": {
      "supports": ["thumbnail", "excerpt", "author", "comments"],
      "public": true,
      "hasArchive": true
    },
    "createdAt": "2025-11-19T12:57:59.000Z",
    "updatedAt": "2025-11-19T12:57:59.000Z",
    "fieldDefinitions": [...] // Include relations if needed
  }
]
```

#### 2. Get Single Post Type
```http
GET /api/post-types/:id
GET /api/post-types/slug/:slug

Response: 200 OK
{
  "id": "uuid",
  "name": "Event",
  "slug": "event",
  // ... all fields
  "fieldDefinitions": [
    {
      "id": "uuid",
      "name": "event_date",
      "label": "Event Date",
      "fieldType": "date",
      "isRequired": true,
      "displayOrder": 1,
      "validationRules": {
        "min": "2025-11-19"
      },
      "fieldOptions": {
        "format": "YYYY-MM-DD",
        "placeholder": "Select event date"
      }
    }
  ]
}
```

#### 3. Create Post Type
```http
POST /api/post-types
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "name": "Recipe",
  "singularLabel": "Recipe",
  "pluralLabel": "Recipes",
  "description": "Cooking recipes with ingredients and instructions",
  "icon": "chef-hat",
  "menuIcon": "chef-hat",
  "menuPosition": 10,
  "isHierarchical": false,
  "supportsComments": true,
  "supportsRevisions": true,
  "showInRest": true,
  "restBase": "recipes",
  "settings": {
    "supports": ["thumbnail", "excerpt", "author"]
  }
}

Response: 201 Created
{
  "id": "uuid",
  "slug": "recipe", // Auto-generated
  // ... all fields
}
```

#### 4. Update Post Type
```http
PATCH /api/post-types/:id
Authorization: Bearer <token>
Content-Type: application/json

Request Body: (partial update)
{
  "name": "Recipe Book",
  "description": "Updated description"
}

Response: 200 OK
// Updated post type
```

#### 5. Delete Post Type
```http
DELETE /api/post-types/:id
Authorization: Bearer <token>

Response: 204 No Content

Note: Cannot delete system post types (isSystem: true)
```

---

### Field Definitions Endpoints

#### 1. Get Fields for Post Type
```http
GET /api/post-types/:postTypeId/fields

Response: 200 OK
[
  {
    "id": "uuid",
    "postTypeId": "uuid",
    "name": "event_date",
    "label": "Event Date",
    "fieldType": "date",
    "description": "When the event takes place",
    "isRequired": true,
    "isSearchable": false,
    "isFilterable": true,
    "isSortable": true,
    "displayOrder": 1,
    "validationRules": {
      "min": "2025-11-19"
    },
    "fieldOptions": {
      "format": "YYYY-MM-DD",
      "placeholder": "Select event date"
    }
  }
]
```

#### 2. Create Field Definition
```http
POST /api/post-types/:postTypeId/fields
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "name": "prep_time",
  "label": "Preparation Time",
  "fieldType": "number",
  "description": "Time to prepare in minutes",
  "isRequired": true,
  "displayOrder": 1,
  "validationRules": {
    "min": 1,
    "max": 300
  },
  "fieldOptions": {
    "step": 5,
    "suffix": " minutes"
  }
}

Response: 201 Created
// Created field definition
```

#### 3. Update Field Definition
```http
PATCH /api/post-types/:postTypeId/fields/:id
Authorization: Bearer <token>

Request Body: (partial update)
{
  "label": "Prep Time (Minutes)",
  "isRequired": false
}

Response: 200 OK
// Updated field definition
```

#### 4. Reorder Fields
```http
POST /api/post-types/:postTypeId/fields/reorder
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "fieldOrders": [
    { "id": "field-uuid-1", "displayOrder": 1 },
    { "id": "field-uuid-2", "displayOrder": 2 },
    { "id": "field-uuid-3", "displayOrder": 3 }
  ]
}

Response: 200 OK
// All updated fields
```

#### 5. Delete Field Definition
```http
DELETE /api/post-types/:postTypeId/fields/:id
Authorization: Bearer <token>

Response: 204 No Content
```

---

### Content Endpoints

#### 1. Get Content List
```http
GET /api/content/:postTypeSlug
Query Parameters:
  - status: string (draft, published, etc.)
  - limit: number (1-100, default: 20)
  - offset: number (default: 0)
  - search: string (full-text search)
  - fields: object (field filters in JSON)

Examples:
GET /api/content/events?status=published&limit=10
GET /api/content/events?search=conference
GET /api/content/events?fields={"location":"New York"}

Response: 200 OK
{
  "data": [
    {
      "id": "uuid",
      "postTypeId": "uuid",
      "authorId": "uuid",
      "title": "Tech Conference 2025",
      "slug": "tech-conference-2025",
      "excerpt": "Annual technology conference",
      "status": "published",
      "field_data": {
        "event_date": "2025-12-15",
        "location": "New York",
        "price": "299.00",
        "max_attendees": "500",
        "description": "<p>Full event description...</p>"
      },
      "metadata": {
        "seoTitle": "Tech Conference 2025",
        "seoDescription": "Join us for..."
      },
      "viewCount": 1234,
      "publishedAt": "2025-11-15T10:00:00.000Z",
      "createdAt": "2025-11-01T08:00:00.000Z"
    }
  ],
  "total": 45,
  "limit": 10,
  "offset": 0
}
```

#### 2. Get Single Content
```http
GET /api/content/:postTypeSlug/:id
GET /api/content/:postTypeSlug/slug/:slug

Response: 200 OK
{
  "id": "uuid",
  "postTypeId": "uuid",
  "title": "Tech Conference 2025",
  "slug": "tech-conference-2025",
  "field_data": {
    "event_date": "2025-12-15",
    "location": "New York",
    // ... all custom fields
  },
  "attachments": [...],
  "tags": [...],
  "categories": [...],
  "author": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

#### 3. Create Content
```http
POST /api/content/:postTypeSlug
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "title": "Tech Conference 2025",
  "excerpt": "Annual technology conference",
  "status": "draft",
  "field_data": {
    "event_date": "2025-12-15",
    "location": "New York",
    "price": "299.00",
    "max_attendees": "500",
    "description": "<p>Full description...</p>"
  },
  "metadata": {
    "seoTitle": "Custom SEO title",
    "seoDescription": "Custom meta description"
  },
  "attachmentIds": ["uuid1", "uuid2"],
  "tagIds": ["uuid1", "uuid2"],
  "categoryIds": ["uuid1"]
}

Response: 201 Created
// Created content with all relationships
```

#### 4. Update Content
```http
PATCH /api/content/:postTypeSlug/:id
Authorization: Bearer <token>

Request Body: (partial update)
{
  "title": "Updated Title",
  "status": "published",
  "field_data": {
    "location": "San Francisco" // Partial field update
  }
}

Response: 200 OK
// Updated content
```

#### 5. Publish Content
```http
POST /api/content/:postTypeSlug/:id/publish
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid",
  "status": "published",
  "publishedAt": "2025-11-19T14:30:00.000Z"
}
```

#### 6. Schedule Content
```http
POST /api/content/:postTypeSlug/:id/schedule
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "scheduledFor": "2025-12-01T09:00:00.000Z"
}

Response: 200 OK
{
  "id": "uuid",
  "status": "scheduled",
  "scheduledFor": "2025-12-01T09:00:00.000Z"
}
```

#### 7. Delete Content
```http
DELETE /api/content/:postTypeSlug/:id
Authorization: Bearer <token>

Response: 204 No Content
```

---

## 🔐 Authentication

All write operations require JWT authentication.

### Headers Required:
```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Getting Access Token:
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@kuybi.dev",
  "password": "Admin@123"
}

Response:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@kuybi.dev",
    "name": "Admin User"
  }
}
```

### Permission Requirements (ACL):

| Operation | Required Permission |
|-----------|-------------------|
| View Post Types | `Action.Read` on `Subject.PostType` |
| Create Post Type | `Action.Create` on `Subject.PostType` |
| Update Post Type | `Action.Update` on `Subject.PostType` |
| Delete Post Type | `Action.Delete` on `Subject.PostType` |
| View Content | `Action.Read` on `Subject.Content` |
| Create Content | `Action.Create` on `Subject.Content` |
| Update Own Content | `Action.Update` on `Subject.Content` with `{ authorId: userId }` |
| Update Any Content | `Action.Update` on `Subject.Content` |
| Publish Content | `Action.Publish` on `Subject.Content` |

---

## 💻 Implementation Examples

### Example 1: Fetch and Display Post Types

```typescript
// services/postTypes.ts
import axios from 'axios'

const API_BASE = 'http://localhost:4000/api'

export interface PostType {
  id: string
  name: string
  slug: string
  singularLabel: string
  pluralLabel: string
  description: string
  icon: string
  isActive: boolean
  isSystem: boolean
  fieldDefinitions?: FieldDefinition[]
}

export interface FieldDefinition {
  id: string
  name: string
  label: string
  fieldType: string
  isRequired: boolean
  displayOrder: number
  validationRules: Record<string, any>
  fieldOptions: Record<string, any>
}

export const postTypesService = {
  async getAll(includeInactive = false): Promise<PostType[]> {
    const response = await axios.get(`${API_BASE}/post-types`, {
      params: { includeInactive }
    })
    return response.data
  },

  async getBySlug(slug: string): Promise<PostType> {
    const response = await axios.get(`${API_BASE}/post-types/slug/${slug}`)
    return response.data
  },

  async create(data: Partial<PostType>, token: string): Promise<PostType> {
    const response = await axios.post(`${API_BASE}/post-types`, data, {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.data
  }
}
```

### Example 2: Dynamic Form Builder

```vue
<!-- components/DynamicForm.vue -->
<template>
  <form @submit.prevent="handleSubmit">
    <div v-for="field in fields" :key="field.id" class="form-field">
      <!-- Text Field -->
      <div v-if="field.fieldType === 'text'" class="field-group">
        <label :for="field.name">
          {{ field.label }}
          <span v-if="field.isRequired" class="required">*</span>
        </label>
        <input
          :id="field.name"
          v-model="formData[field.name]"
          type="text"
          :placeholder="field.fieldOptions?.placeholder"
          :required="field.isRequired"
          :minlength="field.validationRules?.minLength"
          :maxlength="field.validationRules?.maxLength"
        />
        <span v-if="field.description" class="help-text">
          {{ field.description }}
        </span>
      </div>

      <!-- Number Field -->
      <div v-else-if="field.fieldType === 'number'" class="field-group">
        <label :for="field.name">
          {{ field.label }}
          <span v-if="field.isRequired" class="required">*</span>
        </label>
        <input
          :id="field.name"
          v-model.number="formData[field.name]"
          type="number"
          :required="field.isRequired"
          :min="field.validationRules?.min"
          :max="field.validationRules?.max"
          :step="field.fieldOptions?.step || 1"
        />
      </div>

      <!-- Date Field -->
      <div v-else-if="field.fieldType === 'date'" class="field-group">
        <label :for="field.name">
          {{ field.label }}
          <span v-if="field.isRequired" class="required">*</span>
        </label>
        <input
          :id="field.name"
          v-model="formData[field.name]"
          type="date"
          :required="field.isRequired"
          :min="field.validationRules?.min"
          :max="field.validationRules?.max"
        />
      </div>

      <!-- Select Field -->
      <div v-else-if="field.fieldType === 'select'" class="field-group">
        <label :for="field.name">
          {{ field.label }}
          <span v-if="field.isRequired" class="required">*</span>
        </label>
        <select
          :id="field.name"
          v-model="formData[field.name]"
          :required="field.isRequired"
        >
          <option value="">Select...</option>
          <option
            v-for="choice in field.fieldOptions?.choices"
            :key="choice"
            :value="choice"
          >
            {{ choice }}
          </option>
        </select>
      </div>

      <!-- WYSIWYG Field (use your preferred editor) -->
      <div v-else-if="field.fieldType === 'wysiwyg'" class="field-group">
        <label :for="field.name">
          {{ field.label }}
          <span v-if="field.isRequired" class="required">*</span>
        </label>
        <rich-text-editor
          v-model="formData[field.name]"
          :toolbar="field.fieldOptions?.toolbar"
        />
      </div>

      <!-- Add more field types as needed -->
    </div>

    <button type="submit" :disabled="submitting">
      {{ submitting ? 'Saving...' : 'Save' }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import type { FieldDefinition } from '@/types/postTypes'

interface Props {
  fields: FieldDefinition[]
  initialData?: Record<string, any>
}

const props = defineProps<Props>()
const emit = defineEmits(['submit'])

const formData = reactive(props.initialData || {})
const submitting = ref(false)

const handleSubmit = async () => {
  submitting.value = true
  try {
    emit('submit', formData)
  } finally {
    submitting.value = false
  }
}
</script>
```

### Example 3: Content List with Filters

```vue
<!-- pages/ContentList.vue -->
<template>
  <div class="content-list">
    <div class="filters">
      <input
        v-model="searchQuery"
        type="search"
        placeholder="Search..."
        @input="debouncedSearch"
      />
      
      <select v-model="statusFilter" @change="loadContent">
        <option value="">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>

      <button @click="showCreateModal = true">Create New</button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else-if="error" class="error">
      {{ error }}
    </div>

    <div v-else class="content-grid">
      <div
        v-for="item in contentItems"
        :key="item.id"
        class="content-card"
        @click="viewContent(item.id)"
      >
        <h3>{{ item.title }}</h3>
        <p class="excerpt">{{ item.excerpt }}</p>
        <div class="meta">
          <span class="status" :class="item.status">{{ item.status }}</span>
          <span class="views">{{ item.viewCount }} views</span>
          <span class="date">{{ formatDate(item.createdAt) }}</span>
        </div>
        <div class="custom-fields">
          <div v-for="(value, key) in item.field_data" :key="key" class="field">
            <strong>{{ formatFieldName(key) }}:</strong> {{ value }}
          </div>
        </div>
      </div>
    </div>

    <div class="pagination">
      <button :disabled="offset === 0" @click="prevPage">Previous</button>
      <span>Page {{ currentPage }} of {{ totalPages }}</span>
      <button :disabled="!hasMore" @click="nextPage">Next</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { contentService } from '@/services/content'
import { debounce } from 'lodash-es'

const postTypeSlug = 'events' // or from route params
const contentItems = ref([])
const loading = ref(false)
const error = ref(null)
const searchQuery = ref('')
const statusFilter = ref('')
const limit = 20
const offset = ref(0)
const total = ref(0)

const currentPage = computed(() => Math.floor(offset.value / limit) + 1)
const totalPages = computed(() => Math.ceil(total.value / limit))
const hasMore = computed(() => offset.value + limit < total.value)

const loadContent = async () => {
  loading.value = true
  error.value = null
  try {
    const response = await contentService.getAll(postTypeSlug, {
      status: statusFilter.value,
      search: searchQuery.value,
      limit,
      offset: offset.value
    })
    contentItems.value = response.data
    total.value = response.total
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

const debouncedSearch = debounce(loadContent, 300)

const prevPage = () => {
  if (offset.value >= limit) {
    offset.value -= limit
    loadContent()
  }
}

const nextPage = () => {
  if (hasMore.value) {
    offset.value += limit
    loadContent()
  }
}

const formatFieldName = (name: string) => {
  return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString()
}

onMounted(() => {
  loadContent()
})
</script>
```

---

## 🗃️ State Management

### Pinia Store Example

```typescript
// stores/postTypes.ts
import { defineStore } from 'pinia'
import { postTypesService } from '@/services/postTypes'
import type { PostType, FieldDefinition } from '@/types/postTypes'

export const usePostTypesStore = defineStore('postTypes', {
  state: () => ({
    postTypes: [] as PostType[],
    currentPostType: null as PostType | null,
    loading: false,
    error: null as string | null
  }),

  getters: {
    activePostTypes: (state) => 
      state.postTypes.filter(pt => pt.isActive),
    
    customPostTypes: (state) =>
      state.postTypes.filter(pt => !pt.isSystem),
    
    getPostTypeBySlug: (state) => (slug: string) =>
      state.postTypes.find(pt => pt.slug === slug)
  },

  actions: {
    async fetchPostTypes(includeInactive = false) {
      this.loading = true
      this.error = null
      try {
        this.postTypes = await postTypesService.getAll(includeInactive)
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchPostType(slug: string) {
      this.loading = true
      this.error = null
      try {
        this.currentPostType = await postTypesService.getBySlug(slug)
        return this.currentPostType
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async createPostType(data: Partial<PostType>, token: string) {
      this.loading = true
      this.error = null
      try {
        const newPostType = await postTypesService.create(data, token)
        this.postTypes.push(newPostType)
        return newPostType
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    }
  }
})
```

---

## ⚠️ Error Handling

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "name",
      "message": "Name must be between 2 and 100 characters"
    },
    {
      "field": "slug",
      "message": "Slug already exists"
    }
  ]
}
```

### Common Error Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Bad Request | Invalid request data or validation failure |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Insufficient permissions for this action |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Duplicate slug, name, or unique field violation |
| 422 | Unprocessable Entity | Business logic validation failure |
| 500 | Internal Server Error | Server-side error |

### Error Handling Example

```typescript
// services/api.ts
import axios, { AxiosError } from 'axios'

export class ApiError extends Error {
  statusCode: number
  details?: any[]

  constructor(message: string, statusCode: number, details?: any[]) {
    super(message)
    this.statusCode = statusCode
    this.details = details
  }
}

export const handleApiError = (error: AxiosError): never => {
  if (error.response) {
    const { status, data } = error.response
    throw new ApiError(
      data.message || 'An error occurred',
      status,
      data.details
    )
  } else if (error.request) {
    throw new ApiError('No response from server', 0)
  } else {
    throw new ApiError(error.message, 0)
  }
}

// Usage
try {
  await postTypesService.create(data, token)
} catch (error) {
  if (error instanceof ApiError) {
    if (error.statusCode === 409) {
      // Handle duplicate slug
      showNotification('error', 'This name is already taken')
    } else if (error.statusCode === 403) {
      // Handle permission error
      showNotification('error', 'You do not have permission to create post types')
    } else if (error.details) {
      // Handle validation errors
      error.details.forEach(detail => {
        showFieldError(detail.field, detail.message)
      })
    } else {
      showNotification('error', error.message)
    }
  }
}
```

---

## ✅ Best Practices

### 1. Field Type Rendering

Always match the field type to the appropriate UI component:

```typescript
const fieldComponentMap = {
  text: 'TextInput',
  textarea: 'TextareaInput',
  wysiwyg: 'WysiwygEditor',
  email: 'EmailInput',
  number: 'NumberInput',
  date: 'DatePicker',
  select: 'SelectDropdown',
  multiselect: 'MultiSelectDropdown',
  checkbox: 'CheckboxInput',
  toggle: 'ToggleSwitch',
  file: 'FileUpload',
  image: 'ImageUpload',
  color: 'ColorPicker',
  // ... etc
}
```

### 2. Validation

Implement client-side validation matching backend rules:

```typescript
const validateField = (field: FieldDefinition, value: any): string | null => {
  if (field.isRequired && !value) {
    return `${field.label} is required`
  }

  const rules = field.validationRules

  if (field.fieldType === 'text' || field.fieldType === 'textarea') {
    if (rules.minLength && value.length < rules.minLength) {
      return `${field.label} must be at least ${rules.minLength} characters`
    }
    if (rules.maxLength && value.length > rules.maxLength) {
      return `${field.label} must not exceed ${rules.maxLength} characters`
    }
    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      return `${field.label} format is invalid`
    }
  }

  if (field.fieldType === 'number') {
    if (rules.min !== undefined && value < rules.min) {
      return `${field.label} must be at least ${rules.min}`
    }
    if (rules.max !== undefined && value > rules.max) {
      return `${field.label} must not exceed ${rules.max}`
    }
  }

  if (field.fieldType === 'date') {
    const dateValue = new Date(value)
    if (rules.min && dateValue < new Date(rules.min)) {
      return `${field.label} must be after ${rules.min}`
    }
    if (rules.max && dateValue > new Date(rules.max)) {
      return `${field.label} must be before ${rules.max}`
    }
  }

  return null
}
```

### 3. Caching Strategy

Implement aggressive caching for post types and fields:

```typescript
// Cache post types for 30 minutes (they rarely change)
const cachePostTypes = (postTypes: PostType[]) => {
  localStorage.setItem('postTypes', JSON.stringify({
    data: postTypes,
    timestamp: Date.now(),
    ttl: 30 * 60 * 1000 // 30 minutes
  }))
}

const getCachedPostTypes = (): PostType[] | null => {
  const cached = localStorage.getItem('postTypes')
  if (!cached) return null

  const { data, timestamp, ttl } = JSON.parse(cached)
  if (Date.now() - timestamp > ttl) {
    localStorage.removeItem('postTypes')
    return null
  }

  return data
}
```

### 4. Field Data Structure

Always store custom field values in `field_data` object:

```typescript
// ✅ Correct
const contentData = {
  title: "My Event",
  excerpt: "Event description",
  status: "draft",
  field_data: {
    event_date: "2025-12-15",
    location: "New York",
    price: "299.00",
    max_attendees: "500"
  }
}

// ❌ Wrong - don't mix custom fields with content fields
const contentData = {
  title: "My Event",
  excerpt: "Event description",
  status: "draft",
  event_date: "2025-12-15", // This won't work
  location: "New York"      // This won't work
}
```

### 5. Slug Generation

Auto-generate slugs on the frontend for better UX:

```typescript
const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')      // Remove special characters
    .replace(/[\s_-]+/g, '-')      // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '')       // Remove leading/trailing hyphens
}

// Usage
watch(() => formData.title, (newTitle) => {
  if (!slugManuallyEdited.value) {
    formData.slug = generateSlug(newTitle)
  }
})
```

### 6. Optimistic Updates

Update UI immediately, rollback on error:

```typescript
const deleteContent = async (id: string) => {
  // Optimistically remove from UI
  const index = contentItems.value.findIndex(item => item.id === id)
  const removed = contentItems.value.splice(index, 1)[0]

  try {
    await contentService.delete(postTypeSlug, id, token)
    showNotification('success', 'Content deleted')
  } catch (error) {
    // Rollback on error
    contentItems.value.splice(index, 0, removed)
    showNotification('error', 'Failed to delete content')
  }
}
```

### 7. Debounce Search

Avoid excessive API calls:

```typescript
import { debounce } from 'lodash-es'

const searchContent = debounce(async (query: string) => {
  await loadContent({ search: query })
}, 300) // Wait 300ms after user stops typing
```

---

## 📞 Support & Questions

**Backend Team Contact:**
- Slack: #backend-team
- Email: backend@kuybi.dev

**Documentation Updates:**
- This document will be updated as Phase 2 APIs become available
- Check Swagger docs at `http://localhost:4000/api/docs` (available after Phase 2)

**Useful Resources:**
- [Kuybi Backend README](../../../README.md)
- [Dynamic Post Types Plan](../../planning/DYNAMIC_POST_TYPES_PLAN.md)
- [Architecture Overview](../../architecture/ARCHITECTURE_STANDARDIZATION.md)
- [API Reference](../../API_REFERENCE.md)

---

**Last Updated:** November 19, 2025  
**Version:** 1.0.0  
**Status:** Phase 1 Complete - Phase 2 APIs Coming December 1, 2025
