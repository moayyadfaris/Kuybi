# Repository Pattern Implementation

## Overview

The Repository Pattern has been implemented to provide a clean separation between business logic (services) and data access (repositories). This improves testability, maintainability, and follows enterprise-level architecture best practices.

## Architecture

```
┌─────────────────┐
│   Controllers   │  ← HTTP layer
└────────┬────────┘
         │
┌────────▼────────┐
│    Services     │  ← Business logic
└────────┬────────┘
         │
┌────────▼────────┐
│  Repositories   │  ← Data access layer with caching
└────────┬────────┘
         │
┌────────▼────────┐
│   TypeORM       │  ← ORM layer
└────────┬────────┘
         │
┌────────▼────────┐
│   PostgreSQL    │  ← Database
└─────────────────┘
```

## Components

### 1. BaseRepository

**Location:** `src/database/repositories/base.repository.ts`

An abstract base class that provides common data access operations with built-in caching support.

**Features:**
- Generic type support for any entity
- Built-in caching with configurable TTL
- Automatic cache invalidation on updates
- CRUD operations (Create, Read, Update, Delete)
- Search and pagination support
- Cache key management

**Key Methods:**

```typescript
// Find operations
findById(id, options?)           // Find by primary key with caching
findOne(where, options?)         // Find single entity with caching
findMany(options?, cacheOptions?) // Find multiple entities
findAndCount(options?)           // Find with pagination

// Write operations
create(data)                     // Create new entity (invalidates list caches)
update(id, data)                 // Update entity (invalidates caches)
delete(id)                       // Delete entity (invalidates caches)
save(entity)                     // Save entity (create or update)

// Utility methods
count(where?)                    // Count entities
exists(where)                    // Check if entity exists
getRepository()                  // Get underlying TypeORM repository

// Cache management
invalidateEntityCache(id)        // Invalidate specific entity cache
invalidateListCaches()           // Invalidate list/search caches
invalidateAllCaches()            // Clear all entity caches
```

### 2. UserRepository

**Location:** `src/database/repositories/user.repository.ts`

Handles all database operations for User entity with 15-minute cache TTL.

**Specialized Methods:**

```typescript
findByEmail(email)               // Find user by email (cached)
findByMobile(mobileNumber)       // Find user by mobile (cached)
findByRole(role, options?)       // Find users by role (cached)
findActive(options?)             // Find active users (cached)
search(query)                    // Advanced search with filters
updateVerification(id, isVerified) // Update verification status
updateActiveStatus(id, isActive)  // Update active status
updatePassword(id, passwordHash)  // Update password (minimal cache invalidation)
countByRole(role)                // Count users by role
getStats()                       // Get user statistics (5-min cache)
```

**Example Usage:**

```typescript
// In your service
constructor(private readonly userRepository: UserRepository) {}

// Find user by email (cached for 15 minutes)
const user = await this.userRepository.findByEmail('john@example.com')

// Search users with filters
const [users, total] = await this.userRepository.search({
  search: 'john',
  role: 'ROLE_ADMIN',
  isActive: true,
  limit: 20,
  offset: 0
})

// Get user statistics (cached for 5 minutes)
const stats = await this.userRepository.getStats()
// Returns: { total, active, verified, byRole: { ROLE_USER: 150, ROLE_ADMIN: 5 } }
```

### 3. CountryRepository

**Location:** `src/database/repositories/country.repository.ts`

Handles all database operations for Country entity with 1-hour cache TTL (rarely changes).

**Specialized Methods:**

```typescript
findByIso(iso)                   // Find by 2-letter ISO code (cached)
findByIso3(iso3)                 // Find by 3-letter ISO code (cached)
findByContinent(continent)       // Find all countries in continent (cached)
findByRegion(region)             // Find all countries in region (cached)
findAllActive()                  // Find all active countries (cached)
findGroupedByContinent()         // Get countries grouped by continent (cached)
findGroupedByRegion()            // Get countries grouped by region (cached)
search(query)                    // Advanced search with filters
getStats()                       // Get country statistics (10-min cache)
```

**Example Usage:**

```typescript
// In your service
constructor(private readonly countryRepository: CountryRepository) {}

// Find by ISO code (cached for 1 hour)
const country = await this.countryRepository.findByIso('US')

// Advanced search
const result = await this.countryRepository.search({
  search: 'united',
  continent: 'North America',
  isActive: true,
  orderBy: 'name',
  orderDirection: 'ASC',
  page: 0,
  limit: 50
})
// Returns: { results: Country[], total: number, pagination: {...} }

// Get grouped countries (cached for 1 hour)
const grouped = await this.countryRepository.findGroupedByContinent()
// Returns: { 'Europe': [Country, ...], 'Asia': [Country, ...], ... }

// Get statistics (cached for 10 minutes)
const stats = await this.countryRepository.getStats()
// Returns: { total, active, byContinent: {...}, byRegion: {...} }
```

## Integration with Services

### Before (Direct TypeORM Repository)

```typescript
// ❌ Old approach
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}

  async findByEmail(email: string) {
    // No caching, direct DB query every time
    return this.userRepository.findOne({ where: { email } })
  }
}
```

### After (Custom Repository with Caching)

```typescript
// ✅ New approach
@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository
  ) {}

  async findByEmail(email: string) {
    // Automatic caching with 15-minute TTL
    return this.userRepository.findByEmail(email)
  }
  
  async searchUsers(query) {
    // Advanced search with proper filtering
    return this.userRepository.search(query)
  }
}
```

## Module Configuration

Repositories must be provided in the module along with CacheService:

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [
    UsersService,
    UserRepository,    // ← Add repository
    CacheService       // ← Required for caching
  ],
  exports: [UsersService, UserRepository]
})
export class UsersModule {}
```

## Benefits

### 1. **Separation of Concerns**
- Services focus on business logic
- Repositories handle data access
- Clear boundaries and responsibilities

### 2. **Automatic Caching**
- All read operations cached by default
- Configurable TTL per repository
- Automatic cache invalidation on writes

### 3. **Consistent Data Access Patterns**
- Standard methods across all repositories
- Predictable behavior
- Easier for new developers to understand

### 4. **Improved Testability**
- Easy to mock repositories in unit tests
- No direct TypeORM dependency in services
- Cleaner test setup

### 5. **Type Safety**
- Full TypeScript support
- Generic types for entities
- Compile-time error checking

### 6. **Performance**
- Reduced database load via caching
- Smart cache invalidation strategies
- Query optimization at repository level

### 7. **Maintainability**
- Single place to update data access logic
- Reusable query patterns
- Easy to add new features

## Cache Strategy

### Cache Keys

Repositories use structured cache keys:

```
{entityName}:{operation}:{parameters}
```

**Examples:**
```
user:id:123-abc-456
user:email:john@example.com
user:role:ROLE_ADMIN:limit:50:offset:0
user:active:limit:50:offset:0
user:stats

country:id:1
country:iso:US
country:continent:Europe
country:grouped-by-continent
country:stats
```

### Cache TTL

Different data types have different cache durations:

| Data Type | TTL | Reason |
|-----------|-----|--------|
| User data | 15 minutes | Moderate update frequency |
| Country data | 1 hour | Rarely changes |
| Statistics | 5-10 minutes | Calculated data, acceptable lag |
| Search results | 1 hour | Can be long if data stable |

### Cache Invalidation

**Automatic invalidation on:**
- `create()` → Invalidates list caches
- `update()` → Invalidates entity + list caches
- `delete()` → Invalidates entity + list caches
- `save()` → Invalidates entity + list caches

**Manual invalidation:**
```typescript
// Invalidate specific entity
await repository.invalidateEntityCache(id)

// Invalidate all list caches
await repository.invalidateListCaches()

// Nuclear option: clear all caches
await repository.invalidateAllCaches()
```

## Advanced Usage

### Custom Queries

For complex queries not covered by repository methods, use the underlying TypeORM repository:

```typescript
const typeOrmRepo = this.userRepository.getRepository()
const result = await typeOrmRepo
  .createQueryBuilder('user')
  .leftJoin('user.profile', 'profile')
  .where('profile.age > :age', { age: 18 })
  .getMany()
```

### Bypassing Cache

When you need fresh data:

```typescript
// Bypass cache on read
const user = await this.userRepository.findById(id, { bypassCache: true })

// Bypass cache on search
const users = await this.userRepository.findMany(
  { where: { isActive: true } },
  { bypassCache: true }
)
```

### Custom TTL

Override default TTL for specific operations:

```typescript
// Cache for 5 minutes instead of 15
const user = await this.userRepository.findById(id, { ttl: 300 })
```

## Testing

### Unit Testing Services

Repositories make services easier to test:

```typescript
describe('UsersService', () => {
  let service: UsersService
  let repository: jest.Mocked<UserRepository>

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UserRepository,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
          }
        }
      ]
    }).compile()

    service = module.get<UsersService>(UsersService)
    repository = module.get(UserRepository)
  })

  it('should find user by email', async () => {
    const mockUser = { id: '123', email: 'test@example.com', name: 'Test' }
    repository.findByEmail.mockResolvedValue(mockUser as any)

    const result = await service.findByEmail('test@example.com')
    
    expect(result).toEqual(mockUser)
    expect(repository.findByEmail).toHaveBeenCalledWith('test@example.com')
  })
})
```

### Integration Testing Repositories

Test repositories with real database:

```typescript
describe('UserRepository (Integration)', () => {
  let repository: UserRepository
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          database: 'test_db',
          entities: [User],
          synchronize: true
        }),
        TypeOrmModule.forFeature([User])
      ],
      providers: [UserRepository, CacheService]
    }).compile()

    app = module.createNestApplication()
    await app.init()
    repository = module.get(UserRepository)
  })

  it('should create and find user', async () => {
    const user = await repository.create({
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed',
      mobileNumber: '+1234567890'
    })

    const found = await repository.findByEmail('test@example.com')
    expect(found).toBeDefined()
    expect(found.name).toBe('Test User')
  })

  afterAll(async () => {
    await app.close()
  })
})
```

## Creating New Repositories

### 1. Create Repository File

```typescript
// src/database/repositories/story.repository.ts
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from './base.repository'
import { Story } from '../../stories/entities/story.entity'
import { CacheService } from '../../cache/services/cache.service'

@Injectable()
export class StoryRepository extends BaseRepository<Story> {
  protected entityName = 'story'
  protected defaultTTL = 600 // 10 minutes

  constructor(
    @InjectRepository(Story)
    repository: Repository<Story>,
    cacheService: CacheService,
  ) {
    super(repository, cacheService)
  }

  // Add custom methods here
  async findBySlug(slug: string): Promise<Story | null> {
    const cacheKey = this.buildCacheKey('slug', slug)

    return this.cacheService.wrap<Story>(
      cacheKey,
      async () => {
        return this.repository.findOne({ where: { slug } })
      },
      this.defaultTTL,
    )
  }

  async findPublished(options?: { limit?: number; offset?: number }): Promise<Story[]> {
    const cacheKey = this.buildCacheKey(
      'published',
      `limit:${options?.limit ?? 50}`,
      `offset:${options?.offset ?? 0}`,
    )

    return this.cacheService.wrap<Story[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isPublished: true },
          take: options?.limit ?? 50,
          skip: options?.offset ?? 0,
          order: { createdAt: 'DESC' },
        })
      },
      this.defaultTTL,
    )
  }
}
```

### 2. Export from Index

```typescript
// src/database/repositories/index.ts
export { BaseRepository } from './base.repository'
export { UserRepository } from './user.repository'
export { CountryRepository } from './country.repository'
export { StoryRepository } from './story.repository' // Add new repository
```

### 3. Update Module

```typescript
// src/stories/stories.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Story])],
  providers: [
    StoriesService,
    StoryRepository,  // Add repository
    CacheService
  ],
  exports: [StoriesService, StoryRepository]
})
export class StoriesModule {}
```

### 4. Update Service

```typescript
// src/stories/stories.service.ts
@Injectable()
export class StoriesService {
  constructor(
    private readonly storyRepository: StoryRepository
  ) {}

  async findBySlug(slug: string) {
    return this.storyRepository.findBySlug(slug)
  }

  async getPublishedStories(page: number = 0, limit: number = 20) {
    return this.storyRepository.findPublished({
      limit,
      offset: page * limit
    })
  }
}
```

## Migration from Direct TypeORM

If you have existing services using TypeORM repositories directly:

### Step 1: Create Repository

Follow the "Creating New Repositories" guide above.

### Step 2: Update Service

```typescript
// Before
constructor(
  @InjectRepository(MyEntity)
  private readonly myEntityRepository: Repository<MyEntity>
) {}

// After
constructor(
  private readonly myEntityRepository: MyEntityRepository
) {}
```

### Step 3: Update Module

```typescript
// Add repository to providers
providers: [MyService, MyEntityRepository, CacheService]
```

### Step 4: Replace Direct Queries

```typescript
// Before
await this.myEntityRepository.findOne({ where: { id } })

// After
await this.myEntityRepository.findById(id)
```

## Performance Monitoring

Monitor repository performance:

```typescript
// Check cache hit rate
const stats = await this.userRepository.getStats()
console.log(`Cache stats: ${JSON.stringify(stats)}`)

// Monitor Redis
redis-cli INFO stats
redis-cli MONITOR
redis-cli --stat
```

## Best Practices

1. **Use Repository Methods First**
   - Try to use existing repository methods before writing custom queries
   - Leverage built-in caching

2. **Appropriate Cache TTL**
   - Static data: 1 hour+
   - User data: 15 minutes
   - Dynamic data: 5 minutes
   - Real-time data: 1 minute or no cache

3. **Cache Invalidation**
   - Always invalidate on write operations
   - Override `invalidateListCaches()` for custom patterns
   - Be specific with cache keys

4. **Type Safety**
   - Always use generic types
   - Avoid `any` types
   - Leverage TypeScript's type inference

5. **Testing**
   - Mock repositories in unit tests
   - Use real database in integration tests
   - Test cache invalidation logic

6. **Complex Queries**
   - Use `getRepository()` for complex TypeORM queries
   - Consider caching complex query results manually
   - Document performance characteristics

## Next Steps

- [ ] Create StoryRepository for Stories module
- [ ] Add SessionRepository for Auth module  
- [ ] Implement repository pattern for remaining entities
- [ ] Add query performance monitoring
- [ ] Create repository integration tests
- [ ] Document repository API for team

---

**Implementation Status:** ✅ Complete  
**Last Updated:** October 24, 2025  
**Implemented By:** Repository Pattern Task
