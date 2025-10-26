# 🚀 Quick Start: Using Redis Cache

## Installation

Already installed! Dependencies are in `package.json`:
- `@nestjs/cache-manager`
- `cache-manager-redis-yet`
- `ioredis`

## Environment Setup

Add to your `.env`:

```bash
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=          # Leave empty if no password
REDIS_DB=0
REDIS_TTL=3600          # Default TTL: 1 hour
```

## Start Redis (if not running)

```bash
# macOS with Homebrew
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Verify it's running
redis-cli ping
# Should return: PONG
```

## Usage in Your Service

### Step 1: Import CacheService in Your Module

```typescript
// your-feature.module.ts
import { CacheService } from '../cache/services/cache.service'

@Module({
  providers: [YourService, CacheService],
})
export class YourModule {}
```

### Step 2: Inject in Your Service

```typescript
// your-service.ts
import { Injectable } from '@nestjs/common'
import { CacheService } from '../cache/services/cache.service'

@Injectable()
export class YourService {
  constructor(private readonly cacheService: CacheService) {}
}
```

### Step 3: Use Cache

#### Pattern 1: Manual Get/Set

```typescript
async findById(id: number) {
  const key = this.cacheService.buildKey('myentity', 'id', id)
  
  // Try cache first
  const cached = await this.cacheService.get<MyEntity>(key)
  if (cached) return cached
  
  // Fetch from database
  const entity = await this.repository.findOne({ where: { id } })
  
  // Cache for 1 hour
  await this.cacheService.set(key, entity, 3600)
  
  return entity
}
```

#### Pattern 2: Cache Wrap (Recommended)

```typescript
async findById(id: number) {
  const key = this.cacheService.buildKey('myentity', 'id', id)
  
  return this.cacheService.wrap(
    key,
    async () => {
      // This only runs on cache miss
      return this.repository.findOne({ where: { id } })
    },
    3600 // TTL in seconds
  )
}
```

#### Pattern 3: List/Search with Cache

```typescript
async searchItems(query: SearchDto) {
  // Build unique key from query params
  const key = this.buildCacheKey(query)
  
  const cached = await this.cacheService.get(key)
  if (cached) {
    return { ...cached, cached: true }
  }
  
  const results = await this.performSearch(query)
  await this.cacheService.set(key, results, 300) // 5 minutes
  
  return { ...results, cached: false }
}

private buildCacheKey(query: SearchDto): string {
  const parts = ['myentity', 'search']
  if (query.term) parts.push(`term:${query.term}`)
  if (query.page) parts.push(`page:${query.page}`)
  return parts.join(':')
}
```

### Step 4: Invalidate Cache After Updates

```typescript
async update(id: number, data: UpdateDto) {
  // Update database
  const updated = await this.repository.update(id, data)
  
  // Invalidate caches
  await this.cacheService.del(`myentity:id:${id}`)
  await this.cacheService.delPattern('myentity:search:*')
  
  return updated
}
```

## Common TTL Values

```typescript
// Static reference data (rarely changes)
const ONE_DAY = 86400
await this.cacheService.set(key, data, ONE_DAY)

// User profiles (moderate updates)
const FIFTEEN_MINUTES = 900
await this.cacheService.set(key, data, FIFTEEN_MINUTES)

// Search results (frequently changes)
const FIVE_MINUTES = 300
await this.cacheService.set(key, data, FIVE_MINUTES)

// Real-time data (cache briefly to reduce DB load)
const ONE_MINUTE = 60
await this.cacheService.set(key, data, ONE_MINUTE)
```

## Testing Your Cache

```bash
# 1. Start your app
npm run start:dev

# 2. Make a request (cache miss - slower)
curl http://localhost:4000/api/countries?limit=10
# Check response time

# 3. Make the SAME request (cache hit - faster!)
curl http://localhost:4000/api/countries?limit=10
# Should be much faster

# 4. Check health
curl http://localhost:4000/health
# Redis should show "status": "up"
```

## Monitor Redis

```bash
# Connect to Redis CLI
redis-cli

# See all keys
KEYS *

# Watch live commands
MONITOR

# Get a specific key
GET "countries:list:page:0:limit:50"

# Check TTL
TTL "countries:list:page:0:limit:50"

# Delete a key
DEL "countries:list:page:0:limit:50"

# Flush all (be careful!)
FLUSHDB
```

## Troubleshooting

### Cache not working?

1. **Check Redis is running:**
   ```bash
   redis-cli ping
   ```

2. **Check environment variables:**
   ```bash
   echo $REDIS_HOST
   echo $REDIS_PORT
   ```

3. **Check health endpoint:**
   ```bash
   curl http://localhost:4000/health
   ```

4. **Check logs for errors:**
   Look for "Cache error" or "Redis" in console output

### Redis connection refused?

```bash
# macOS
brew services start redis

# Check it started
brew services list | grep redis
```

### Keys not expiring?

Check your TTL is in seconds (not milliseconds):

```typescript
// ✅ Correct (1 hour)
await this.cacheService.set(key, data, 3600)

// ❌ Wrong (way too long!)
await this.cacheService.set(key, data, 3600000)
```

## Best Practices

1. **Always namespace your keys:**
   ```typescript
   // ✅ Good
   const key = this.cacheService.buildKey('users', 'profile', userId)
   
   // ❌ Bad
   const key = userId
   ```

2. **Invalidate after writes:**
   ```typescript
   async create(data: CreateDto) {
     const created = await this.repository.save(data)
     await this.cacheService.delPattern('myentity:list:*')
     return created
   }
   ```

3. **Use appropriate TTLs:**
   - Don't cache forever (memory issues)
   - Don't cache for too short (defeats purpose)
   - Match TTL to data volatility

4. **Handle errors gracefully:**
   ```typescript
   try {
     const cached = await this.cacheService.get(key)
     if (cached) return cached
   } catch (error) {
     console.error('Cache error, falling back to DB')
   }
   // Continue to database query
   ```

## Need Help?

- Read full docs: `src/cache/README.md`
- Check implementation: `src/cache/services/cache.service.ts`
- See example: `src/countries/countries.service.ts`
- Health checks: `GET /health`

---

**That's it!** You now have enterprise-grade caching in your NestJS app. 🎉
