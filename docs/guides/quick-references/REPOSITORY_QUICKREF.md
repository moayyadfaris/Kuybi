# Repository Pattern - Quick Reference

## 🎯 Quick Start

### Using Existing Repositories

```typescript
// 1. Inject repository in your service
constructor(private readonly userRepository: UserRepository) {}

// 2. Use repository methods (all cached automatically)
const user = await this.userRepository.findByEmail('john@example.com')
const country = await this.countryRepository.findByIso('US')
```

## 📋 Common Operations

### User Repository

```typescript
// Find operations
await userRepository.findById(id)
await userRepository.findByEmail(email)
await userRepository.findByMobile(mobile)
await userRepository.findByRole('ROLE_ADMIN', { limit: 20, offset: 0 })
await userRepository.findActive({ limit: 50 })

// Search
const [users, total] = await userRepository.search({
  search: 'john',
  role: 'ROLE_USER',
  isActive: true,
  limit: 20,
  offset: 0
})

// Write operations
await userRepository.create({ name, email, passwordHash, ... })
await userRepository.update(id, { name: 'New Name' })
await userRepository.delete(id)

// Special operations
await userRepository.updateVerification(id, true)
await userRepository.updateActiveStatus(id, false)
await userRepository.updatePassword(id, hashedPassword)
await userRepository.countByRole('ROLE_ADMIN')
const stats = await userRepository.getStats()
```

### Country Repository

```typescript
// Find operations
await countryRepository.findById(id)
await countryRepository.findByIso('US')
await countryRepository.findByIso3('USA')
await countryRepository.findByContinent('Europe')
await countryRepository.findByRegion('Western Europe')
await countryRepository.findAllActive()

// Grouping
const byContinent = await countryRepository.findGroupedByContinent()
const byRegion = await countryRepository.findGroupedByRegion()

// Search
const result = await countryRepository.search({
  search: 'united',
  continent: 'North America',
  isActive: true,
  orderBy: 'name',
  orderDirection: 'ASC',
  page: 0,
  limit: 50
})
// Returns: { results, total, pagination }

// Statistics
const stats = await countryRepository.getStats()
// Returns: { total, active, byContinent, byRegion }
```

## 🔧 Advanced Options

### Bypass Cache

```typescript
// Get fresh data from database
const user = await userRepository.findById(id, { bypassCache: true })
```

### Custom TTL

```typescript
// Cache for 5 minutes instead of default
const user = await userRepository.findById(id, { ttl: 300 })
```

### Access TypeORM Repository

```typescript
// For complex queries
const typeOrmRepo = userRepository.getRepository()
const result = await typeOrmRepo
  .createQueryBuilder('user')
  .where('user.createdAt > :date', { date: yesterday })
  .getMany()
```

## 🗑️ Cache Invalidation

```typescript
// Automatic (happens on create/update/delete)
await userRepository.update(id, data) // Auto-invalidates caches

// Manual
await userRepository.invalidateEntityCache(id)
await userRepository.invalidateListCaches()
await userRepository.invalidateAllCaches()
```

## 📊 Cache TTL Reference

| Repository | Default TTL | Reason |
|------------|-------------|--------|
| UserRepository | 15 min | Moderate updates |
| CountryRepository | 1 hour | Rarely changes |
| Statistics | 5-10 min | Calculated data |

## ✅ Module Setup

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [
    UsersService,
    UserRepository,  // ← Add repository
    CacheService     // ← Required for caching
  ],
  exports: [UsersService, UserRepository]
})
export class UsersModule {}
```

## 🧪 Testing

```typescript
// Mock repository in tests
const mockUserRepository = {
  findByEmail: jest.fn().mockResolvedValue(mockUser),
  create: jest.fn().mockResolvedValue(mockUser),
}

const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: UserRepository, useValue: mockUserRepository }
  ]
}).compile()
```

## 🆕 Creating New Repository

```typescript
// 1. Create file: src/database/repositories/my-entity.repository.ts
@Injectable()
export class MyEntityRepository extends BaseRepository<MyEntity> {
  protected entityName = 'myentity'
  protected defaultTTL = 600 // 10 minutes

  constructor(
    @InjectRepository(MyEntity) repository: Repository<MyEntity>,
    cacheService: CacheService,
  ) {
    super(repository, cacheService)
  }

  // Add custom methods
  async findByCustomField(value: string): Promise<MyEntity | null> {
    const cacheKey = this.buildCacheKey('customField', value)
    return this.cacheService.wrap(
      cacheKey,
      () => this.repository.findOne({ where: { customField: value } }),
      this.defaultTTL
    )
  }
}

// 2. Export from index.ts
export { MyEntityRepository } from './my-entity.repository'

// 3. Add to module
providers: [MyService, MyEntityRepository, CacheService]

// 4. Use in service
constructor(private readonly myEntityRepository: MyEntityRepository) {}
```

## 📚 Full Documentation

See `REPOSITORY_PATTERN.md` for complete documentation including:
- Architecture details
- All available methods
- Caching strategies
- Testing examples
- Migration guide
- Best practices

---

**Quick Links:**
- Full docs: `REPOSITORY_PATTERN.md`
- Base repository: `src/database/repositories/base.repository.ts`
- Examples: `src/database/repositories/user.repository.ts`, `country.repository.ts`
