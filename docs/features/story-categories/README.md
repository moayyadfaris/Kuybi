# Story-Category Relationship

## Overview

The Story-Category relationship provides a many-to-many association between stories and categories, allowing stories to be organized and classified under multiple categories for better content organization and discovery.

## Features

- ✅ **Many-to-Many Relationship** - Stories can have multiple categories, categories can be assigned to multiple stories
- ✅ **Create with Categories** - Assign categories when creating a story
- ✅ **Update with Categories** - Modify story categories during updates
- ✅ **Attach/Detach Categories** - Dedicated endpoints for category management
- ✅ **ACL Protected** - All category operations protected by permission system
- ✅ **Cascade Delete** - Automatic cleanup when stories or categories are deleted
- ✅ **Performance Optimized** - Indexed junction table for fast queries
- ✅ **Validation** - Max 20 categories per story, existence validation

## Database Schema

### Junction Table: `story_categories`

```sql
CREATE TABLE story_categories (
  id SERIAL PRIMARY KEY,
  storyId INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  categoryId UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  createdAt TIMESTAMPTZ DEFAULT NOW(),
  createdBy UUID,
  UNIQUE(storyId, categoryId)
);

-- Performance indexes
CREATE INDEX idx_story_categories_story ON story_categories(storyId);
CREATE INDEX idx_story_categories_category ON story_categories(categoryId);
CREATE INDEX idx_story_categories_unique ON story_categories(storyId, categoryId);
```

### Entity Relationships

**Story Entity:**
```typescript
@ManyToMany(() => Category, (category) => category.stories, { cascade: false })
@JoinTable({
  name: 'story_categories',
  joinColumn: { name: 'storyId', referencedColumnName: 'id' },
  inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
})
categories?: Category[]
```

**Category Entity:**
```typescript
@ManyToMany(() => Story, (story) => story.categories)
stories?: Story[]
```

## API Endpoints

### 1. Create Story with Categories

**Endpoint:** `POST /api/v1/stories`

**Request Body:**
```json
{
  "title": "Breaking News Story",
  "details": "Detailed story content...",
  "type": "STORY",
  "status": "DRAFT",
  "priority": "HIGH",
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ]
}
```

**Response:** `201 Created`
```json
{
  "id": 123,
  "title": "Breaking News Story",
  "categories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Politics",
      "slug": "politics"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "World News",
      "slug": "world-news"
    }
  ]
}
```

**ACL Requirement:** `Action.Create` on `Subject.Story`

### 2. Update Story with Categories

**Endpoint:** `PATCH /api/v1/stories/:id`

**Request Body:**
```json
{
  "title": "Updated Story Title",
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440002"
  ]
}
```

**Response:** `200 OK`

**ACL Requirement:** `Action.Update` on `Subject.Story`

### 3. Attach Categories to Story

**Endpoint:** `POST /api/v1/stories/:id/categories`

**Request Body:**
```json
{
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440003",
    "550e8400-e29b-41d4-a716-446655440004"
  ]
}
```

**Response:** `200 OK`
```json
{
  "id": 123,
  "title": "Story Title",
  "categories": [
    { "id": "...", "name": "Technology" },
    { "id": "...", "name": "Science" }
  ]
}
```

**Features:**
- Automatically avoids duplicates
- Validates all categories exist and are active
- Requires story ownership or admin permission
- Invalidates cache after update

**ACL Requirement:** `Action.Update` on `Subject.Story`

### 4. Detach Categories from Story

**Endpoint:** `DELETE /api/v1/stories/:id/categories`

**Request Body:**
```json
{
  "categoryIds": [
    "550e8400-e29b-41d4-a716-446655440003"
  ]
}
```

**Response:** `200 OK`

**ACL Requirement:** `Action.Update` on `Subject.Story`

### 5. Get Story Categories

**Endpoint:** `GET /api/v1/stories/:id/categories`

**Response:** `200 OK`
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Politics",
    "slug": "politics",
    "description": "Political news and analysis",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00Z"
  }
]
```

**ACL Requirement:** None (public endpoint)

## Usage Examples

### TypeScript/NestJS Service

```typescript
import { StoriesService } from './stories.service'

@Injectable()
export class MyService {
  constructor(private readonly storiesService: StoriesService) {}

  async createStoryWithCategories() {
    const story = await this.storiesService.create(
      {
        title: 'Tech News',
        type: StoryType.STORY,
        status: StoryStatus.DRAFT,
        priority: StoryPriority.HIGH,
        categoryIds: [
          '550e8400-e29b-41d4-a716-446655440000', // Technology
          '550e8400-e29b-41d4-a716-446655440001', // Innovation
        ],
      },
      userId,
    )

    return story
  }

  async addCategoriesToStory(storyId: number) {
    return await this.storiesService.attachCategories(
      storyId,
      {
        categoryIds: [
          '550e8400-e29b-41d4-a716-446655440002',
        ],
      },
      userId,
    )
  }

  async getStoryCategories(storyId: number) {
    return await this.storiesService.getCategories(storyId)
  }
}
```

### cURL Examples

```bash
# Create story with categories
curl -X POST http://localhost:4040/api/v1/stories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Breaking News",
    "type": "STORY",
    "status": "DRAFT",
    "priority": "HIGH",
    "categoryIds": ["550e8400-e29b-41d4-a716-446655440000"]
  }'

# Attach categories
curl -X POST http://localhost:4040/api/v1/stories/123/categories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryIds": [
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002"
    ]
  }'

# Get story categories
curl -X GET http://localhost:4040/api/v1/stories/123/categories

# Detach categories
curl -X DELETE http://localhost:4040/api/v1/stories/123/categories \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryIds": ["550e8400-e29b-41d4-a716-446655440001"]
  }'
```

## Validation Rules

### CreateStoryDto / UpdateStoryDto

- `categoryIds` (optional)
  - Type: `string[]` (UUID v4 format)
  - Max items: 20
  - Each UUID must be valid v4 format
  - All categories must exist and be active (deletedAt = null)

### AttachCategoriesDto

- `categoryIds` (required)
  - Type: `string[]` (UUID v4 format)
  - Min items: 1
  - Max items: 20
  - Each UUID must be valid v4 format
  - All categories must exist and be active

### DetachCategoriesDto

- `categoryIds` (required)
  - Type: `string[]` (UUID v4 format)
  - Min items: 1
  - Max items: 20
  - Each UUID must be valid v4 format

## Business Logic

### Create Story with Categories

1. Validate story data
2. Extract `categoryIds` from DTO
3. Create story in database
4. If categoryIds provided:
   - Fetch categories from database
   - Validate all exist and are active
   - Attach categories to story via junction table
5. Invalidate cache if needed
6. Return story with categories relation

### Attach Categories

1. Load story with existing categories
2. Verify ownership or admin permission
3. Validate all new categories exist and are active
4. Filter out duplicates (already attached)
5. Add only new categories to story
6. Save updated story
7. Invalidate cache
8. Return updated story

### Detach Categories

1. Load story with existing categories
2. Verify ownership or admin permission
3. Filter out specified categories
4. Save updated story
5. Invalidate cache
6. Return updated story

## Performance Considerations

### Database Indexes

- **Unique index** on `(storyId, categoryId)` prevents duplicates
- **Performance indexes** on both foreign keys for fast lookups
- **CASCADE DELETE** ensures automatic cleanup

### Caching Strategy

- Story cache invalidated after category attach/detach
- Cache key: `story:id:{storyId}`
- TTL: 15 minutes (configurable)

### Query Optimization

- Use TypeORM's `In()` operator for batch category lookups
- Eager loading with `relations: ['categories']` when needed
- Selective loading - only load categories when requested

## Error Handling

### Common Errors

1. **404 Not Found**
   - Story does not exist
   - Story is soft-deleted

2. **400 Bad Request**
   - One or more categories not found
   - One or more categories are inactive
   - Invalid UUID format
   - Exceeds maximum 20 categories

3. **403 Forbidden**
   - User is not story owner
   - User lacks required permission
   - Not authenticated

4. **401 Unauthorized**
   - Missing JWT token
   - Invalid JWT token
   - Expired JWT token

## Security & ACL

### Permission Requirements

- **Create Story:** `Action.Create` on `Subject.Story`
- **Update Story:** `Action.Update` on `Subject.Story`
- **Attach Categories:** `Action.Update` on `Subject.Story`
- **Detach Categories:** `Action.Update` on `Subject.Story`
- **Get Categories:** Public (no permission required)

### Ownership Check

All modification operations verify:
1. User is story owner (`story.userId === userId`), OR
2. User is admin (has admin role)

## Migration Guide

### Running the Migration

```bash
cd nest-app
npm run migration:run
```

This will create the `story_categories` junction table with:
- Primary key
- Foreign key constraints with CASCADE delete
- Unique constraint on (storyId, categoryId)
- Performance indexes

### Rollback

```bash
npm run migration:revert
```

## Testing Checklist

- [x] Create story with categories
- [x] Create story without categories
- [x] Update story to add categories
- [x] Update story to change categories
- [x] Attach categories to existing story
- [x] Prevent duplicate category attachments
- [x] Detach categories from story
- [x] Get story categories
- [x] Validate category existence
- [x] Validate max 20 categories
- [x] Verify ownership requirements
- [x] Test ACL permissions
- [x] Verify cache invalidation
- [x] Test cascade delete

## Future Enhancements

### Planned Features

1. **Category Ordering** - Add `order` field to junction table
2. **Primary Category** - Mark one category as primary
3. **Category Statistics** - Track story count per category
4. **Bulk Operations** - Update categories for multiple stories
5. **Category History** - Track when categories were added/removed
6. **Category Suggestions** - ML-based category recommendations

### API Enhancements

1. **Filter Stories by Category** - `GET /api/v1/stories?categoryId=...`
2. **Filter Stories by Multiple Categories** - `GET /api/v1/stories?categoryIds[]=...&categoryIds[]=...`
3. **Replace All Categories** - `PUT /api/v1/stories/:id/categories` (replace instead of attach)
4. **Get Category Stories** - `GET /api/v1/categories/:id/stories`

## Related Documentation

- [Stories API Documentation](../stories/README.md)
- [Categories API Documentation](../categories/README.md)
- [ACL System Documentation](../acl/README.md)
- [Database Migrations](../../database/migrations/README.md)

## Changelog

### v1.0.0 (2024-10-25)

- ✅ Initial implementation
- ✅ Database migration for junction table
- ✅ Entity relationships configured
- ✅ DTOs created (AttachCategoriesDto, DetachCategoriesDto)
- ✅ Service methods implemented
- ✅ Controller endpoints created
- ✅ ACL guards integrated
- ✅ Documentation completed
