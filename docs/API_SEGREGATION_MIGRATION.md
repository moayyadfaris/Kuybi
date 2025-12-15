# API Segregation - Frontend Migration Guide

## Overview

The Kuybi backend now has separate API structures for admin and public access:

- **Admin API**: `/api/v1/*` - Requires JWT authentication + CASL permissions
- **Public API**: `/api/web/v1/*` - No authentication, rate limited (100 req/15min), sanitized responses

## Changes Made

### Backend (kuybi)

#### Phase 1: Secured Admin API ✅
- Added authentication guards to all stories endpoints
- Applied CASL ACL checks for fine-grained permissions
- Updated Swagger documentation with auth requirements

#### Phase 2: Created Public Web API ✅
- New module: `src/modules/web/`
- Public controllers for stories and categories
- Response sanitization (removes internal fields)
- Rate limiting with @nestjs/throttler

### Frontend (kuybi-web - Next.js)

#### Updated Files ✅

**1. src/lib/api-client.ts**
```typescript
// Added /web/v1 endpoints to public list
const PUBLIC_ENDPOINTS = [
  '/web/v1/stories',      // ← NEW
  '/web/v1/categories',   // ← NEW
  '/stories',
  '/categories',
  // ... other endpoints
];
```

**2. src/services/story.service.ts**
```typescript
// Before
getPublishedStories: async (filters?) => {
  return apiClient.get(`/stories${query}`);
}

// After
getPublishedStories: async (filters?) => {
  return apiClient.get(`/web/v1/stories${query}`);  // ← Changed
}

// Also updated:
getStoryById: async (id) => {
  return apiClient.get(`/web/v1/stories/${id}`);    // ← Changed
}
```

**3. src/services/category.service.ts**
```typescript
// Updated all methods to use /web/v1:
getCategories() → /web/v1/categories
getCategoryBySlug() → /web/v1/categories/slug/:slug
getCategoryById() → /web/v1/categories/:id
getCategoryTree() → /web/v1/categories/tree
```

**4. test-public-access.sh**
- Updated to test `/api/web/v1` endpoints
- Validates no authentication required
- Checks response data format

### Dashboard (kuybi-dashboard - Vue)

#### New File ✅

**client/src/services/publicApiService.ts**
- Dedicated service for public API access
- Separate axios instance (no auth headers)
- Methods for public stories and categories

```typescript
import publicApiService from '@/services/publicApiService'

// Usage
const stories = await publicApiService.getPublishedStories({ page: 1, limit: 20 })
const categories = await publicApiService.getActiveCategories()
```

## Testing

### Backend
```bash
cd kuybi

# Test admin API (requires auth)
TOKEN=$(curl -s -X POST http://localhost:4040/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kuybi.dev","password":"Admin@123"}' \
  | jq -r '.data.accessToken')

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4040/api/v1/stories

# Test public API (no auth)
curl http://localhost:4040/api/web/v1/stories?limit=5
curl http://localhost:4040/api/web/v1/categories
```

### Next.js Frontend
```bash
cd kuybi-web

# Run test script
bash test-public-access.sh

# Expected output:
# ✓ GET /web/v1/stories - HTTP 200
# ✓ GET /web/v1/categories - HTTP 200  
# ✓ GET /web/v1/categories/tree - HTTP 200
```

## API Comparison

### Stories

| Endpoint | Old | New | Auth Required |
|----------|-----|-----|---------------|
| List published | `/v1/stories` | `/web/v1/stories` | ❌ No |
| Get by ID | `/v1/stories/:id` | `/web/v1/stories/:id` | ❌ No |
| Create | `/v1/stories` | `/v1/stories` | ✅ Yes |
| Update | `/v1/stories/:id` | `/v1/stories/:id` | ✅ Yes |
| Delete | `/v1/stories/:id` | `/v1/stories/:id` | ✅ Yes |

### Categories

| Endpoint | Old | New | Auth Required |
|----------|-----|-----|---------------|
| List active | `/v1/categories` | `/web/v1/categories` | ❌ No |
| Get tree | `/v1/categories/tree` | `/web/v1/categories/tree` | ❌ No |
| Get by slug | `/v1/categories/slug/:slug` | `/web/v1/categories/slug/:slug` | ❌ No |
| Get by ID | `/v1/categories/:id` | `/web/v1/categories/:id` | ❌ No |
| Create | `/v1/categories` | `/v1/categories` | ✅ Yes |
| Update | `/v1/categories/:id` | `/v1/categories/:id` | ✅ Yes |
| Delete | `/v1/categories/:id` | `/v1/categories/:id` | ✅ Yes |

## Response Sanitization

Public API responses have internal fields removed:

**Removed Fields:**
- `createdBy`
- `updatedBy`
- `deletedBy`
- `deletedAt`
- `version`
- Sensitive metadata

**Example:**

```typescript
// Admin API response (/api/v1/stories/:id)
{
  id: 1,
  title: "My Story",
  content: "...",
  createdBy: "uuid-here",    // ← Visible to admins
  updatedBy: "uuid-here",    // ← Visible to admins
  version: 3,                // ← Visible to admins
  metadata: { ... }          // ← All metadata visible
}

// Public API response (/api/web/v1/stories/:id)
{
  id: 1,
  title: "My Story",
  content: "...",
  // Internal fields removed
  metadata: {
    viewCount: 100,          // ← Only safe fields
    featuredImageUrl: "..." 
  }
}
```

## Rate Limiting

Public API endpoints are rate limited:
- **Limit**: 100 requests per 15 minutes per IP
- **Response**: HTTP 429 Too Many Requests
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Breaking Changes

### ⚠️ Admin Dashboard Users

If you were using public pages in the admin dashboard, update imports:

```typescript
// Old
import { storyService } from '@/services/storyService'
const stories = await storyService.getStories()

// New (for public data)
import { publicApiService } from '@/services/publicApiService'
const stories = await publicApiService.getPublishedStories()

// Admin operations still use storyService with auth
import { storyService } from '@/services/storyService'
const story = await storyService.createStory(data)
```

### ⚠️ Next.js Frontend

No breaking changes - updates are backward compatible. The Next.js frontend automatically uses the correct endpoints based on whether you're calling:
- `getPublishedStories()` → `/web/v1/stories` (public)
- `createStory()` → `/v1/stories` (admin, requires auth)

## Environment Variables

No changes required. Existing `.env` configuration works:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4040/api
```

The services automatically append the correct paths:
- Public: `${API_URL}/web/v1/...`
- Admin: `${API_URL}/v1/...`

## Rollback

If you need to rollback:

```bash
# Revert Next.js changes
cd kuybi-web
git checkout HEAD~1 src/lib/api-client.ts
git checkout HEAD~1 src/services/story.service.ts
git checkout HEAD~1 src/services/category.service.ts

# Backend - disable web module
cd kuybi
# Comment out WebModule in src/app.module.ts
```

## Next Steps

1. ✅ Backend API segregation complete
2. ✅ Frontend integration complete
3. ⏳ Monitor rate limiting in production
4. ⏳ Add caching layer if needed
5. ⏳ Consider CDN for static content

## Support

For issues or questions:
- Check logs: `kuybi/logs/`
- Test endpoints: `bash kuybi-web/test-public-access.sh`
- Review docs: `kuybi/docs/planning/API_SEGREGATION_PLAN.md`

---

**Migration Date**: December 15, 2025  
**Status**: ✅ Complete  
**Tested**: Backend + Next.js + Vue Dashboard
