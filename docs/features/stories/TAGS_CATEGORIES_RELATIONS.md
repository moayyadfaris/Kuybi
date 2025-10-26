# Story Tags & Categories Relations Enhancement

## Overview
Enhanced all story retrieval endpoints to automatically include `tags` and `categories` relations in the response.

## Changes Made

### Modified File: `src/database/repositories/story.repository.ts`

#### 1. **Override `findById()` Method**
Added tags and categories relations to single story retrieval:

```typescript
async findById(
  id: string | number,
  options?: { ttl?: number; bypassCache?: boolean },
): Promise<Story | null> {
  // ... caching logic
  return this.repository.findOne({ 
    where: { id } as any,
    relations: ['tags', 'categories']
  })
}
```

#### 2. **Updated `findByUser()` Method**
Added `leftJoinAndSelect` for tags and categories:

```typescript
const query = this.repository
  .createQueryBuilder('story')
  .leftJoinAndSelect('story.tags', 'tags')
  .leftJoinAndSelect('story.categories', 'categories')
  .where('story.userId = :userId', { userId })
  // ... rest of query
```

#### 3. **Updated `findByStatus()` Method**
```typescript
.leftJoinAndSelect('story.tags', 'tags')
.leftJoinAndSelect('story.categories', 'categories')
```

#### 4. **Updated `findByType()` Method**
```typescript
.leftJoinAndSelect('story.tags', 'tags')
.leftJoinAndSelect('story.categories', 'categories')
```

#### 5. **Updated `findByPriority()` Method**
```typescript
.leftJoinAndSelect('story.tags', 'tags')
.leftJoinAndSelect('story.categories', 'categories')
```

#### 6. **Updated `findChildren()` Method**
```typescript
.leftJoinAndSelect('story.tags', 'tags')
.leftJoinAndSelect('story.categories', 'categories')
```

#### 7. **Updated `search()` Method**
```typescript
const builder = this.repository.createQueryBuilder('story')
  .leftJoinAndSelect('story.tags', 'tags')
  .leftJoinAndSelect('story.categories', 'categories')
  // ... rest of search logic
```

## Affected Endpoints

All story retrieval endpoints now return tags and categories:

### ✅ GET `/api/v1/stories` - List all stories
**Response includes:**
```json
{
  "results": [
    {
      "id": 1,
      "title": "Story Title",
      "tags": [
        { "id": 1, "name": "politics", "slug": "politics" },
        { "id": 2, "name": "economy", "slug": "economy" }
      ],
      "categories": [
        { "id": 1, "name": "News", "slug": "news" }
      ]
    }
  ]
}
```

### ✅ GET `/api/v1/stories/:id` - Get story by ID
**Response includes:**
```json
{
  "id": 1,
  "title": "Story Title",
  "tags": [...],
  "categories": [...]
}
```

### ✅ GET `/api/v1/stories/user/:userId` - Get user stories
Returns stories with tags and categories

### ✅ GET `/api/v1/stories/status/:status` - Get stories by status
Returns stories with tags and categories

### ✅ GET `/api/v1/stories/type/:type` - Get stories by type
Returns stories with tags and categories

### ✅ GET `/api/v1/stories/:id/children` - Get child stories
Returns stories with tags and categories

## Performance Considerations

### Caching
- All queries remain cached with the same TTL (10 minutes)
- Cache keys remain unique per query parameters
- Relations are loaded with the cached data

### Query Optimization
- Using `leftJoinAndSelect` for optimal SQL joins
- Single query loads story + tags + categories (no N+1 problem)
- Relations are eagerly loaded only when needed

### Example SQL Generated
```sql
SELECT story.*, tags.*, categories.*
FROM story
LEFT JOIN story_tags ON story.id = story_tags.storyId
LEFT JOIN tags ON story_tags.tagId = tags.id
LEFT JOIN story_categories ON story.id = story_categories.storyId
LEFT JOIN categories ON story_categories.categoryId = categories.id
WHERE story.id = $1
```

## Entity Relations

Relations already defined in `src/stories/entities/story.entity.ts`:

```typescript
// Many-to-many with tags
@ManyToMany(() => Tag, { cascade: false })
@JoinTable({
  name: 'story_tags',
  joinColumn: { name: 'storyId', referencedColumnName: 'id' },
  inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
})
tags?: Tag[]

// Many-to-many with categories
@ManyToMany('Category', 'stories', { cascade: false })
@JoinTable({
  name: 'story_categories',
  joinColumn: { name: 'storyId', referencedColumnName: 'id' },
  inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
})
categories?: any[]
```

## Testing

### Test Story Creation with Tags
```bash
curl --location 'http://localhost:4040/api/v1/stories' \
--header 'Authorization: Bearer <token>' \
--header 'Content-Type: application/json' \
--data '{
    "title": "Test Story",
    "details": "Story with tags and categories",
    "type": "REPORT",
    "status": "DRAFT",
    "priority": "NORMAL",
    "tags": ["politics", "economy"]
}'
```

### Test Get Story by ID
```bash
curl --location 'http://localhost:4040/api/v1/stories/1' \
--header 'Authorization: Bearer <token>'
```

**Expected Response:**
```json
{
  "id": 1,
  "title": "Test Story",
  "details": "Story with tags and categories",
  "type": "REPORT",
  "status": "DRAFT",
  "priority": "NORMAL",
  "tags": [
    {
      "id": 1,
      "name": "politics",
      "slug": "politics",
      "description": null,
      "createdAt": "2025-10-26T..."
    },
    {
      "id": 2,
      "name": "economy",
      "slug": "economy",
      "description": null,
      "createdAt": "2025-10-26T..."
    }
  ],
  "categories": [],
  "createdAt": "2025-10-26T...",
  "updatedAt": "2025-10-26T..."
}
```

### Test List Stories
```bash
curl --location 'http://localhost:4040/api/v1/stories' \
--header 'Authorization: Bearer <token>'
```

**Expected Response:**
```json
{
  "results": [
    {
      "id": 1,
      "tags": [...],
      "categories": [...]
    }
  ],
  "total": 1,
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

## Benefits

✅ **Consistency**: All story endpoints return complete data  
✅ **Performance**: Single query with joins (no N+1 queries)  
✅ **Caching**: Relations included in cached results  
✅ **Developer Experience**: No need to make separate API calls for tags/categories  
✅ **Frontend Ready**: Complete data in one request

## Notes

- Relations are optional (`tags?` and `categories?`) so they won't break if null
- Using `leftJoinAndSelect` ensures stories without tags/categories are still returned
- Cache invalidation already handles these relations properly
- No breaking changes to existing API contracts

---

**Implemented**: October 26, 2025  
**Impact**: All story retrieval endpoints  
**Status**: ✅ Complete - Ready for testing
