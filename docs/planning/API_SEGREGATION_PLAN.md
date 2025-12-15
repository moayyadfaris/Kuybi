# Enterprise API Segregation Plan - Kuybi Backend

## 📋 Executive Summary

**Objective**: Create separate API paths for web (public/consumer) access vs. admin/internal access with proper security boundaries.

**Current State**:
- All APIs under `api/v1/*` (e.g., `api/v1/stories`, `api/v1/categories`)
- Stories controller currently has some public GET endpoints (no auth guards)
- Categories controller has auth guards on ALL endpoints (returns 401 for public access)

**Proposed Architecture**:
```
api/
├── v1/              # Internal/Admin APIs (secure, existing)
│   ├── stories      # ✅ Add auth guards to ALL endpoints
│   ├── categories   # ✅ Keep existing auth guards
│   ├── users        # ✅ Already secured
│   └── ...
│
└── web/v1/          # Public/Consumer APIs (new, selective access)
    ├── stories      # 📖 Read-only published content
    ├── categories   # 📖 Read-only active categories
    ├── tags         # 📖 Read-only tags
    └── ...
```

---

## 🎯 Goals

1. **Security First**: Secure all admin APIs, expose only safe read-only data publicly
2. **Clear Separation**: Different API paths for different use cases
3. **Enterprise Pattern**: Follow industry standards (e.g., Stripe has `/v1/*` and `/public/*`)
4. **Backward Compatible**: Don't break existing admin dashboard
5. **Performance**: Leverage existing caching, add public-specific optimizations
6. **Scalability**: Easy to add new public endpoints

---

## 🏗️ Detailed Architecture

### Option 1: `/api/web/v1/*` (Recommended)

```
Base URL: http://localhost:4040/api

Admin/Internal APIs:
  POST   /api/v1/stories              # Create story (auth required)
  PATCH  /api/v1/stories/:id          # Update story (auth required)
  DELETE /api/v1/stories/:id          # Delete story (auth required)
  GET    /api/v1/stories              # List all stories (auth required)
  GET    /api/v1/categories           # All categories (auth required)

Public/Web APIs:
  GET    /api/web/v1/stories          # Published stories only (public)
  GET    /api/web/v1/stories/:slug    # Published story detail (public)
  GET    /api/web/v1/categories       # Active categories only (public)
  GET    /api/web/v1/categories/:slug # Category detail (public)
  GET    /api/web/v1/tags             # Active tags (public)
```

**Benefits**:
- ✅ Clear semantic separation (`web` = public consumer)
- ✅ Easy to understand and document
- ✅ Scalable for future additions (e.g., `/api/mobile/v1`)
- ✅ Industry-standard pattern

### Option 2: `/api/public/v1/*` (Alternative)

Same structure but use `/api/public/v1/*` instead of `/api/web/v1/*`

**Benefits**:
- ✅ More explicit about access level
- ✅ Follows REST convention (public vs private)

**Drawback**:
- ⚠️ Less specific about intended consumer (could be web, mobile, external)

### Option 3: `/api/v2/*` (Not Recommended for this use case)

Create a new API version for public access.

**Drawback**:
- ❌ Version number doesn't indicate access level
- ❌ Confusing - versions should be for API changes, not access patterns

---

## 📐 Implementation Strategy

### Phase 1: Secure Existing Admin APIs (Priority 1) ⚡

**Stories Controller** - Add auth guards to ALL endpoints:

```typescript
// File: src/modules/stories/controllers/stories.controller.ts

@ApiTags('Stories - Admin')
@Controller('v1/stories')
@UseGuards(JwtAuthGuard, AbilityGuard) // ← Add at class level
@ApiBearerAuth()
export class StoriesController {
  
  // All endpoints now require auth by default
  
  @Get()
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  findAll(@Query() filterDto: StoryFilterDto) {
    return this.storiesService.findAll(filterDto)
  }
  
  // ... rest of endpoints
}
```

**Impact**: Stories API will require authentication (matches categories)

**Timeline**: 30 minutes

---

### Phase 2: Create Public Web Module (Priority 2)

**Structure**:
```
src/modules/web/
├── web.module.ts                    # Main module
├── controllers/
│   ├── web-stories.controller.ts   # Public stories API
│   ├── web-categories.controller.ts # Public categories API
│   └── web-tags.controller.ts      # Public tags API
├── services/
│   ├── web-stories.service.ts      # Public stories logic
│   ├── web-categories.service.ts   # Public categories logic
│   └── web-tags.service.ts         # Public tags logic
└── dto/
    ├── web-story-filters.dto.ts    # Public filters
    └── web-category-filters.dto.ts # Public filters
```

**Key Principles**:
1. **No Auth Guards**: Public endpoints by design
2. **Filter Published Only**: Only return published/active content
3. **Rate Limiting**: Apply stricter limits for public APIs
4. **Sanitized Responses**: Remove sensitive fields (internal notes, etc.)
5. **Caching**: Aggressive caching for public data

**Example Controller**:

```typescript
// src/modules/web/controllers/web-stories.controller.ts

@ApiTags('Web API - Stories')
@Controller('web/v1/stories')
@UseThrottlerGuard() // Public API rate limiting
export class WebStoriesController {
  constructor(private readonly webStoriesService: WebStoriesService) {}

  @Get()
  @ApiOperation({ 
    summary: 'Get published stories (public)',
    description: 'Returns only published stories. No authentication required.'
  })
  @ApiResponse({ status: 200, description: 'List of published stories' })
  async findPublished(@Query() filters: WebStoryFiltersDto) {
    // Only published stories, sanitized response
    return this.webStoriesService.findPublished(filters)
  }

  @Get(':slug')
  @ApiOperation({ 
    summary: 'Get published story by slug (public)',
    description: 'Returns story details if published. No authentication required.'
  })
  @ApiResponse({ status: 200, description: 'Story found' })
  @ApiResponse({ status: 404, description: 'Story not found or not published' })
  async findBySlug(@Param('slug') slug: string) {
    return this.webStoriesService.findPublishedBySlug(slug)
  }

  // No POST, PATCH, DELETE - read-only API
}
```

**Timeline**: 4-6 hours

---

### Phase 3: Create Public Services (Priority 3)

**Services** encapsulate business logic for public access:

```typescript
// src/modules/web/services/web-stories.service.ts

@Injectable()
export class WebStoriesService {
  constructor(
    private readonly storiesRepository: StoriesRepository,
    private readonly cacheService: CacheService
  ) {}

  async findPublished(filters: WebStoryFiltersDto): Promise<PaginatedResult<WebStoryDto>> {
    const cacheKey = `web:stories:published:${JSON.stringify(filters)}`
    
    return this.cacheService.wrap(cacheKey, async () => {
      // Only PUBLISHED status
      const stories = await this.storiesRepository.find({
        ...filters,
        status: StoryStatus.PUBLISHED, // Force published
        includeDeleted: false,          // No deleted stories
      })
      
      // Sanitize response - remove sensitive fields
      return {
        results: stories.map(story => this.sanitizeStory(story)),
        total: stories.length,
        pagination: this.buildPagination(filters, stories.length)
      }
    }, 600) // Cache for 10 minutes
  }

  private sanitizeStory(story: Story): WebStoryDto {
    // Remove sensitive fields
    const { internalNotes, deletionReason, ...publicData } = story
    return publicData
  }
}
```

**Timeline**: 2-3 hours

---

### Phase 4: Update Frontend Integration (Priority 4)

**Update API Client** to use new endpoints:

```typescript
// kuybi-web/src/lib/api-client.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4040/api';

// Public endpoints use /web/v1
const PUBLIC_ENDPOINTS = [
  '/web/v1/stories',
  '/web/v1/categories',
  '/web/v1/tags',
  '/auth/login',
  '/auth/register',
];

// Admin endpoints use /v1
const ADMIN_ENDPOINTS = [
  '/v1/stories',
  '/v1/categories',
  '/v1/users',
  // ... all admin APIs
];
```

**Update Services**:

```typescript
// kuybi-web/src/services/story.service.ts

export const storyService = {
  // Public API - no auth
  getPublishedStories: async (filters?: StoryFilters) => {
    return apiClient.get<PaginatedResponse<Story>>(
      '/web/v1/stories', // ← Use public endpoint
      filters
    );
  },

  // Admin API - requires auth
  getAllStories: async (filters?: StoryFilters) => {
    return apiClient.get<PaginatedResponse<Story>>(
      '/v1/stories', // ← Use admin endpoint
      filters
    );
  },

  createStory: async (data: CreateStoryDto) => {
    return apiClient.post<Story>('/v1/stories', data); // Admin only
  },
};
```

**Timeline**: 1-2 hours

---

## 🔒 Security Configuration

### Rate Limiting (Different for Public vs Admin)

```typescript
// src/modules/web/web.module.ts

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,      // 60 seconds
      limit: 100,   // 100 requests per minute (stricter for public)
    }),
  ],
  // ...
})
export class WebModule {}
```

### CORS (Allow public access)

```typescript
// src/main.ts

app.enableCors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://kuybi.com',      // Production frontend
    'https://www.kuybi.com',
  ],
  methods: ['GET'],            // Public API is GET-only
  credentials: true,
});
```

### Response Sanitization

```typescript
// Remove sensitive fields from public responses
interface WebStoryDto {
  id: number
  title: string
  details: string
  status: 'PUBLISHED'        // Always published
  createdAt: Date
  updatedAt: Date
  categories: Category[]
  tags: Tag[]
  mainImage: Attachment
  // Excluded: internalNotes, deletionReason, userId (internal use only)
}
```

---

## 📊 API Comparison

| Feature | Admin API (`/api/v1/*`) | Public API (`/api/web/v1/*`) |
|---------|-------------------------|------------------------------|
| **Authentication** | Required (JWT) | None (public) |
| **Authorization** | Role-based (CASL) | None |
| **Rate Limit** | 20 req/min | 100 req/min |
| **Methods** | GET, POST, PATCH, DELETE | GET only |
| **Data Filter** | All statuses | Published only |
| **Response** | Full data | Sanitized data |
| **Caching** | 5 min (admin needs fresh) | 10 min (aggressive) |
| **Use Case** | Admin dashboard, CMS | Public website, mobile app |

---

## 🚀 Migration Path

### Step 1: Immediate (Today)
1. ✅ Secure stories controller (add auth guards)
2. ✅ Test admin dashboard still works
3. ✅ Update frontend to handle 401 on stories

### Step 2: This Week
1. ✅ Create web module structure
2. ✅ Implement web-stories controller/service
3. ✅ Implement web-categories controller/service
4. ✅ Add rate limiting for public APIs
5. ✅ Write unit tests

### Step 3: Testing
1. ✅ Test public endpoints without auth
2. ✅ Test admin endpoints with auth
3. ✅ Verify caching works
4. ✅ Load test public endpoints

### Step 4: Frontend Integration
1. ✅ Update frontend services to use `/web/v1/*`
2. ✅ Test public pages (homepage, articles, categories)
3. ✅ Verify admin pages still work

### Step 5: Documentation
1. ✅ Update API documentation (Swagger)
2. ✅ Update README with new endpoints
3. ✅ Create public API guide

---

## 📝 Configuration Changes

### Environment Variables

Add to `.env`:
```env
# Public API Configuration
PUBLIC_API_RATE_LIMIT_TTL=60
PUBLIC_API_RATE_LIMIT=100
PUBLIC_API_CACHE_TTL=600

# Admin API Configuration  
ADMIN_API_RATE_LIMIT_TTL=60
ADMIN_API_RATE_LIMIT=20
```

---

## ✅ Testing Checklist

### Backend Tests
- [ ] All `/v1/stories` endpoints return 401 without auth
- [ ] All `/web/v1/stories` endpoints return 200 without auth
- [ ] Public API only returns published stories
- [ ] Public API sanitizes responses (no internal fields)
- [ ] Rate limiting works for public APIs
- [ ] Caching works for public APIs

### Frontend Tests
- [ ] Homepage loads stories without login
- [ ] Articles page loads without login
- [ ] Admin dashboard requires login
- [ ] Create/Edit stories requires login
- [ ] Public API called for public pages
- [ ] Admin API called for admin pages

---

## 🎯 Recommendation

**Go with Option 1: `/api/web/v1/*`**

**Rationale**:
1. Clear semantic meaning (web = consumer-facing)
2. Scalable (can add `/api/mobile/v1`, `/api/partner/v1` later)
3. Industry standard pattern
4. Easy to document and understand

**Timeline**:
- **Phase 1** (Secure admin APIs): 30 min
- **Phase 2** (Create web module): 4-6 hours
- **Phase 3** (Services & logic): 2-3 hours
- **Phase 4** (Frontend update): 1-2 hours
- **Testing**: 2 hours

**Total**: ~1-2 days of focused work

---

## 📞 Next Steps

**Immediate Action** (Do this first):
1. Secure stories controller (add auth guards to class level)
2. Test that admin dashboard still works with auth

**Then**:
1. Review this plan and approve approach
2. Create web module with controllers
3. Update frontend to use new endpoints
4. Test thoroughly
5. Deploy

Would you like me to start with **Phase 1** (securing the stories controller) right now?
