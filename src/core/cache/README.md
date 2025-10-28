# Redis Caching Module

## Overview

Enterprise-grade Redis caching integration for the Susanoo NestJS application.

## Features

- ✅ Redis-backed distributed caching
- ✅ Automatic fallback to memory cache if Redis unavailable
- ✅ Type-safe cache operations
- ✅ Custom TTL support per operation
- ✅ Cache key decorators
- ✅ Pattern-based cache invalidation
- ✅ Health checks for monitoring
- ✅ Error handling with graceful degradation

## Configuration

### Environment Variables

```bash
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=          # Optional
REDIS_DB=0               # Database number
REDIS_TTL=3600           # Default TTL in seconds (1 hour)
```

### Configuration Object

Located in `src/config/configuration.ts`:

```typescript
redis: {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  ttl: parseInt(process.env.REDIS_TTL || '3600', 10)
}
```

## Usage

### Basic Caching in Services

```typescript
import { Injectable } from '@nestjs/common'
import { CacheService } from '../cache/services/cache.service'

@Injectable()
export class MyService {
  constructor(private readonly cacheService: CacheService) {}

  async getData(id: string) {
    const cacheKey = this.cacheService.buildKey('mydata', id)
    
    // Try to get from cache
    const cached = await this.cacheService.get<MyData>(cacheKey)
    if (cached) {
      return cached
    }

    // Fetch from database
    const data = await this.repository.findById(id)
    
    // Cache for 1 hour (3600 seconds)
    await this.cacheService.set(cacheKey, data, 3600)
    
    return data
  }
}
```

### Using Cache Wrap

The `wrap` method simplifies caching by automatically handling get/set:

```typescript
async findById(id: number): Promise<Country | null> {
  const cacheKey = this.cacheService.buildKey('country', 'id', id)
  
  return this.cacheService.wrap(
    cacheKey,
    async () => {
      // This function only executes if cache miss
      return this.countryRepository.findOne({ where: { id } })
    },
    3600, // TTL in seconds
  )
}
```

### Cache Invalidation

```typescript
// Delete single key
await this.cacheService.del('country:id:1')

// Delete by pattern (use cautiously on large keyspaces)
await this.cacheService.delPattern('country:*')

// Reset all cache
await this.cacheService.reset()
```

### Cache Key Building

Use the helper to create consistent, namespaced keys:

```typescript
// Simple key
const key = this.cacheService.buildKey('user', 'profile', userId)
// Result: "user:profile:123"

// Complex key
const key = this.cacheService.buildKey('stories', 'list', `page:${page}`, `limit:${limit}`)
// Result: "stories:list:page:0:limit:50"
```

## Cache Decorators

### @CacheKey

Define custom cache keys for controller methods:

```typescript
import { CacheKey, CacheTTL } from '../cache/decorators/cache-key.decorator'

@Get(':id')
@CacheKey('country:{id}')
@CacheTTL(7200) // 2 hours
async findOne(@Param('id') id: string) {
  return this.countriesService.findById(id)
}
```

### @CacheTTL

Override default TTL for specific methods:

```typescript
@Get()
@CacheTTL(600) // 10 minutes instead of default 1 hour
async findAll() {
  return this.countriesService.findAll()
}
```

## Example: Countries Service Integration

```typescript
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Country } from './entities/country.entity'
import { CacheService } from '../cache/services/cache.service'

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
    private readonly cacheService: CacheService,
  ) {}

  async searchCountries(query: ListCountriesQueryDto) {
    // Build cache key from query parameters
    const cacheKey = this.buildCacheKey(query)
    
    // Try cache first
    const cached = await this.cacheService.get(cacheKey)
    if (cached) {
      return { ...cached, cached: true }
    }

    // Fetch from DB
    const results = await this.fetchFromDatabase(query)
    
    // Cache for 1 hour
    await this.cacheService.set(cacheKey, results, 3600)
    
    return { ...results, cached: false }
  }

  async invalidateCache(): Promise<void> {
    await this.cacheService.delPattern('countries:*')
  }

  private buildCacheKey(query: ListCountriesQueryDto): string {
    const parts = ['countries', 'list']
    if (query.search) parts.push(`search:${query.search}`)
    if (query.continent) parts.push(`continent:${query.continent}`)
    return parts.join(':')
  }
}
```

## Health Checks

Check Redis connectivity:

```bash
# Full health check (DB + Redis)
GET /health

# Readiness check
GET /health/ready

# Liveness check
GET /health/live
```

Response example:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  },
  "details": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

## Best Practices

### 1. Cache Key Naming Convention

Use hierarchical, namespaced keys:

```
<domain>:<entity>:<operation>:<identifier>
```

Examples:
- `country:id:123`
- `countries:list:page:0:limit:50`
- `user:profile:abc-def-ghi`
- `auth:session:xyz-123`

### 2. TTL Guidelines

- **Static reference data** (countries, categories): 1-24 hours
- **User profiles**: 5-15 minutes
- **Search results**: 1-5 minutes
- **Session data**: Match token expiry
- **Analytics/aggregations**: 10-30 minutes

### 3. Cache Invalidation Strategy

```typescript
// After creating/updating/deleting data
async updateCountry(id: number, data: UpdateCountryDto) {
  const updated = await this.repository.update(id, data)
  
  // Invalidate related caches
  await this.cacheService.del(`country:id:${id}`)
  await this.cacheService.delPattern('countries:list:*')
  
  return updated
}
```

### 4. Error Handling

Always handle cache errors gracefully:

```typescript
try {
  const cached = await this.cacheService.get(key)
  if (cached) return cached
} catch (error) {
  console.error('Cache error, falling back to DB:', error)
  // Continue to DB query
}
```

## Monitoring

Monitor cache performance via:

1. **Hit/Miss Ratio**: Add headers to track cache hits
2. **Health endpoint**: `/health/ready` checks Redis connectivity
3. **Application logs**: Cache errors are logged automatically
4. **Redis CLI**: Monitor Redis directly

```bash
# Connect to Redis
redis-cli

# Monitor commands
MONITOR

# Check keys
KEYS countries:*

# Get TTL
TTL country:id:123

# Get info
INFO stats
```

## Troubleshooting

### Redis Connection Refused

Check Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

Start Redis:
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Cache Not Working

1. Check environment variables are set correctly
2. Verify Redis connectivity: `GET /health/ready`
3. Check logs for cache errors
4. Ensure CacheService is injected in your module providers

### Memory Issues

Monitor Redis memory:
```bash
redis-cli INFO memory
```

Set max memory policy in Redis config:
```
maxmemory 256mb
maxmemory-policy allkeys-lru
```

## Performance Impact

Expected improvements with caching:

- **Countries list**: 50ms → 2ms (25x faster)
- **User profile lookups**: 30ms → 1ms (30x faster)
- **Search results**: 100ms → 5ms (20x faster)
- **Session validation**: 20ms → <1ms (20x+ faster)

## Testing

Mock the CacheService in tests:

```typescript
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  wrap: jest.fn((key, fn) => fn()),
  buildKey: jest.fn((...parts) => parts.join(':')),
}

const module: TestingModule = await Test.createTestingModule({
  providers: [
    MyService,
    { provide: CacheService, useValue: mockCacheService },
  ],
}).compile()
```

## Migration from Express App

The caching implementation mirrors your Express app's Redis usage:

- **Similar patterns**: Cache-aside, TTL management
- **Key compatibility**: Can share Redis instance if needed
- **Feature parity**: Wrap, pattern deletion, health checks
- **Enhanced**: Type safety, better error handling, decorators

## Next Steps

- [ ] Add cache warming on application startup
- [ ] Implement cache statistics/metrics
- [ ] Add distributed cache invalidation (pub/sub)
- [ ] Implement cache compression for large objects
- [ ] Add cache versioning for breaking changes
