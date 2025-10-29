# Susanoo NestJS - AI Coding Assistant Guide

## Project Overview
Enterprise-grade NestJS backend for Susanoo platform with sophisticated authentication, ACL, caching, and content management. Built using Domain-Driven Design principles with repository pattern and extensive Redis caching.

## Architecture Patterns

### Repository Pattern with Caching
All data access uses `BaseRepository<T>` extending TypeORM with built-in Redis caching:
```typescript
// Example: CategoryRepository extends BaseRepository<Category>
const category = await categoryRepository.findById(id, { ttl: 3600 })
await categoryRepository.invalidateListCaches() // After mutations
```
- **Cache keys**: `{entityName}:{operation}:{params}` 
- **TTL**: 1 hour default, customizable per operation
- **Auto-invalidation**: List caches cleared on create/update/delete

### Module Structure Standard
```
src/{module}/
├── {module}.module.ts
├── controllers/          # REST endpoints  
├── services/            # Business logic (REQUIRED)
├── dto/                 # Data transfer objects
├── entities/            # TypeORM entities
├── guards/              # Auth/ACL guards
└── {specific}/          # abilities/, strategies/, seeders/
```

### ACL & Authentication Flow
1. **JWT tokens** via `@nestjs/jwt` with refresh token rotation
2. **CASL abilities** for fine-grained permissions (`src/acl/abilities/`)
3. **Session management** with Redis storage and cleanup jobs
4. **Token blacklisting** for immediate logout enforcement

Example ACL usage:
```typescript
@CheckAbilities({ action: Action.Create, subject: 'Category' })
@UseGuards(JwtAuthGuard, AbilityGuard)
async createCategory() { }
```

## Development Workflows

### Database Operations
```bash
# Run migrations
npm run migration:run

# Seed data  
npm run db:seed:countries
npm run db:seed:users     # Creates admin@susano.dev / Admin@123
npm run db:seed:acl       # Sets up roles/permissions

# Revert last migration
npm run migration:revert
```

### Testing ACL Guards
Use provided shell scripts for comprehensive ACL testing:
```bash
./test/scripts/quick-acl-test.sh       # Fast validation of core ACL functionality
./test/scripts/test-acl-guards.sh      # Full guard validation with edge cases
```
Tests use pre-configured admin token and validate authentication, authorization, and CRUD operations.

### Cache Management
Redis caching is integral to performance (25-80x improvements documented):
```typescript
// Repository-level caching
await repository.findById(id, { bypassCache: true }) // Skip cache
await repository.invalidateAllCaches() // Clear all entity caches

// Service-level caching  
await cacheService.wrap(key, expensiveOperation, ttl)
```

### Logging with Pino
Structured logging with correlation IDs:
```typescript
@InjectPinoLogger(ServiceName.name) 
private readonly logger: PinoLogger

this.logger.info({ userId, action: 'login' }, 'User authentication successful')
```

## Service Patterns

### Authentication Services
- **AuthService**: Login/logout, token management
- **SessionsService**: Multi-device session tracking, risk assessment  
- **TokenBlacklistService**: Immediate token invalidation via Redis
- **SessionCleanupService**: Automated session pruning with @Cron

### Repository Service Pattern
Each entity has dedicated repository extending `BaseRepository<T>`:
```typescript
@Injectable()
export class CategoryRepository extends BaseRepository<Category> {
  protected entityName = 'category'
  
  async findBySlug(slug: string) {
    return this.findOne({ slug }, { ttl: 7200 })
  }
}
```

### DTO Validation
Comprehensive validation using `class-validator`:
```typescript
export class CreateStoryDto {
  @IsString() @Length(1, 200)
  title: string
  
  @IsOptional() @IsArray() @IsUUID(4, { each: true })
  tagIds?: string[]
}
```

## Integration Points

### AWS S3 Attachments
File uploads handled by `AttachmentsService` with S3 presigned URLs:
```typescript
POST /api/attachments 
# Form-data: file, category?, description?, tags?, generateThumbnails?
# Returns: { url, downloadUrl, metadata }
```

### Cross-Module Communication
- **Entities reference by ID only** (no direct imports)
- **Domain events** for async communication (planned)
- **Repository facades** for cross-module data access

### Configuration Management
Environment-based config in `src/config/configuration.ts`:
```typescript
// Access via ConfigService injection
database: { host, port, username, password, name }
redis: { host, port, password, db }
auth: { jwtSecret, refreshSecret, accessTokenTtl }
```

## Common Gotchas

### Cache Invalidation
Always invalidate caches after mutations:
```typescript
// ❌ Don't do this
await repository.save(entity)
return entity

// ✅ Do this  
const saved = await repository.save(entity) // Auto-invalidates
return saved
```

### ACL Implementation
Use proper ability checks, not role-based hardcoding:
```typescript
// ❌ Avoid
if (user.role === 'admin') { }

// ✅ Prefer
@CheckAbilities({ action: Action.Update, subject: Category })
```

### Repository vs Direct TypeORM
Always use repository layer, never inject Repository<T> directly:
```typescript
// ❌ Avoid
@InjectRepository(Category) private categoryRepo: Repository<Category>

// ✅ Use
constructor(private categoryRepository: CategoryRepository)
```

### Testing with ACL
Use shell scripts for comprehensive testing - they include proper token handling and cover authentication flows that unit tests might miss.

## Key Files for Context
- `src/app.module.ts` - Module registration and global providers
- `src/database/data-source.ts` - Entity registration and DB config
- `src/database/repositories/base.repository.ts` - Core data access patterns
- `docs/architecture/ARCHITECTURE_STANDARDIZATION.md` - Detailed structure guide
- `docs/README.md` - Comprehensive feature documentation index

## Development Server
```bash
npm run start:dev  # Runs on http://localhost:4000/api
# API docs at http://localhost:4000/api/docs
# Health check at http://localhost:4000/api/health
```

Default admin: `admin@susano.dev` / `Admin@123`