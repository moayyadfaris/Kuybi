# Categories API - Quick Reference

## 🚀 Quick Start

```bash
# Get all categories
GET /categories

# Get active categories (cached 1 hour)
GET /categories/active

# Create category (requires JWT)
POST /categories
Authorization: Bearer <token>
{
  "name": "Technology",
  "description": "Tech stories"
}

# Get category by slug
GET /categories/slug/technology
```

## 📋 All Endpoints

### Public (No Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/categories` | GET | Search/list with filters |
| `/categories/active` | GET | Active categories (cached) |
| `/categories/stats` | GET | Statistics (cached 5min) |
| `/categories/:id` | GET | Get by ID |
| `/categories/slug/:slug` | GET | Get by slug |

### Protected (JWT Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/categories` | POST | Create |
| `/categories/:id` | PATCH | Update |
| `/categories/:id` | DELETE | Soft delete |
| `/categories/:id/restore` | POST | Restore deleted |
| `/categories/:id/hard` | DELETE | Permanent delete |

## 📝 Request Examples

### Create Category

```json
POST /categories
Authorization: Bearer <token>

{
  "name": "Technology",
  "slug": "tech",  // Optional, auto-generated from name
  "description": "Stories about tech",
  "isActive": true,
  "metadata": {
    "color": "#0080FF",
    "icon": "tech"
  }
}
```

### Search Categories

```
GET /categories?search=tech&isActive=true&page=0&limit=20&orderBy=name&orderDirection=ASC
```

**Query Parameters:**
- `search` - Search in name, slug, description
- `isActive` - Filter by active status (true/false)
- `includeDeleted` - Include soft-deleted (true/false)
- `orderBy` - Sort field (name, slug, createdAt, updatedAt)
- `orderDirection` - Sort direction (ASC, DESC)
- `page` - Page number (0-indexed)
- `limit` - Items per page (1-100, default: 50)

### Update Category

```json
PATCH /categories/:id
Authorization: Bearer <token>

{
  "name": "Tech & Innovation",
  "isActive": true
}
```

## 📊 Response Examples

### Single Category

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Technology",
  "slug": "technology",
  "description": "Stories about technology",
  "isActive": true,
  "metadata": { "color": "#0080FF" },
  "createdAt": "2025-10-24T10:00:00.000Z",
  "updatedAt": "2025-10-24T10:00:00.000Z",
  "version": 1
}
```

### Search Results

```json
{
  "results": [
    { "id": "...", "name": "Technology", "slug": "technology", ... }
  ],
  "total": 15,
  "pagination": {
    "page": 0,
    "limit": 20,
    "totalPages": 1
  }
}
```

### Statistics

```json
{
  "total": 50,
  "active": 45,
  "inactive": 3,
  "deleted": 2
}
```

## ✅ Validation Rules

| Field | Rules | Example |
|-------|-------|---------|
| **name** | Required, 2-120 chars | "Technology" |
| **slug** | Optional, 2-140 chars, kebab-case, unique | "technology" |
| **description** | Optional, max 500 chars | "Tech stories" |
| **isActive** | Boolean, default: true | true |
| **metadata** | Optional, JSON object | { "color": "#FF0000" } |

### Slug Format

- Lowercase letters, numbers, hyphens only
- Pattern: `^[a-z0-9-]+$`
- Auto-generated from name if not provided
- Example: "Tech & Innovation" → "tech-innovation"

## 🔧 Service Methods

```typescript
// Inject service
constructor(private categoriesService: CategoriesService) {}

// Create with auto-slug
const category = await this.categoriesService.create({
  name: 'Technology'
})

// Search with filters
const result = await this.categoriesService.findAll({
  search: 'tech',
  isActive: true,
  page: 0,
  limit: 20
})

// Get active (cached 1 hour)
const active = await this.categoriesService.findAllActive()

// Get by ID
const category = await this.categoriesService.findOne(id)

// Get by slug
const category = await this.categoriesService.findBySlug('technology')

// Update
const updated = await this.categoriesService.update(id, {
  name: 'New Name'
})

// Soft delete
await this.categoriesService.remove(id)

// Restore
const restored = await this.categoriesService.restore(id)

// Hard delete (permanent)
await this.categoriesService.hardDelete(id)

// Statistics
const stats = await this.categoriesService.getStats()
```

## 🗂️ Repository Methods

```typescript
// Inject repository
constructor(private categoryRepository: CategoryRepository) {}

// Find by slug (cached 1 hour)
const category = await this.categoryRepository.findBySlug('technology')

// Check slug existence
const exists = await this.categoryRepository.slugExists('tech', excludeId)

// Advanced search
const result = await this.categoryRepository.search({
  search: 'tech',
  isActive: true,
  orderBy: 'name',
  orderDirection: 'ASC',
  page: 0,
  limit: 50
})

// Soft delete
const deleted = await this.categoryRepository.softDelete(id, deletedBy)

// Restore
const restored = await this.categoryRepository.restore(id)

// Statistics (cached 5 min)
const stats = await this.categoryRepository.getStats()
```

## 💾 Caching

| Operation | Cache Duration | Cache Key Pattern |
|-----------|---------------|-------------------|
| findById | 1 hour | `category:id:{id}` |
| findBySlug | 1 hour | `category:slug:{slug}` |
| findAllActive | 1 hour | `category:all-active` |
| getStats | 5 minutes | `category:stats` |

**Cache invalidation:** Automatic on create/update/delete

## 🐛 Common Errors

### 409 Conflict - Duplicate Slug

```json
{
  "statusCode": 409,
  "message": "Category with slug 'technology' already exists"
}
```

**Fix:** Use different name or provide custom slug

### 404 Not Found

```json
{
  "statusCode": 404,
  "message": "Category with ID '...' not found"
}
```

**Possible causes:**
- Category was soft-deleted
- Invalid UUID
- Category doesn't exist

### 400 Bad Request - Invalid Slug

```json
{
  "statusCode": 400,
  "message": ["Slug must be kebab-case (lowercase letters, numbers, and hyphens only)"]
}
```

**Fix:** Slug must match: `^[a-z0-9-]+$`

## 🎯 Best Practices

### ✅ Do This

```typescript
// Use slug for URLs (SEO-friendly)
GET /categories/slug/technology

// Let system generate slugs
POST /categories { "name": "Tech & Innovation" }
// → slug: "tech-innovation"

// Use soft delete (recoverable)
DELETE /categories/:id

// Use cached active list
GET /categories/active
```

### ❌ Avoid This

```typescript
// Don't use UUID in URLs (not SEO-friendly)
GET /categories/123e4567-...

// Don't always specify slug manually
POST /categories { "name": "Tech", "slug": "tech" }

// Don't hard delete unless necessary
DELETE /categories/:id/hard

// Don't search for active categories
GET /categories?isActive=true  // Slower than /categories/active
```

## 🧪 Testing

### cURL Examples

```bash
# Get active categories
curl http://localhost:4000/categories/active

# Search
curl "http://localhost:4000/categories?search=tech&page=0&limit=10"

# Get statistics
curl http://localhost:4000/categories/stats

# Create (with auth)
curl -X POST http://localhost:4000/categories \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Technology","description":"Tech stories"}'

# Update
curl -X PATCH http://localhost:4000/categories/:id \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"New Name"}'

# Soft delete
curl -X DELETE http://localhost:4000/categories/:id \
  -H "Authorization: Bearer <token>"

# Restore
curl -X POST http://localhost:4000/categories/:id/restore \
  -H "Authorization: Bearer <token>"
```

## 📚 Full Documentation

See `CATEGORIES_MODULE_COMPLETE.md` for:
- Complete feature list
- Architecture details
- All repository methods
- Caching strategy
- Integration examples
- Testing guide
- Performance benchmarks

---

**Module Status:** ✅ Production Ready  
**Cache Performance:** 24-80x faster  
**Endpoints:** 10 total (5 public, 5 protected)
