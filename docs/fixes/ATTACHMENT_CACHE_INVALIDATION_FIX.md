# Attachment List Cache Invalidation Fix

## Issue

When uploading a new attachment, the list API (`GET /api/v1/attachments`) was returning cached results and not showing the newly uploaded attachment immediately.

## Root Cause

The `AttachmentRepository` had a custom `invalidateCacheForEntity()` method that:
1. Used `del()` instead of `delPattern()` for wildcard patterns (incorrect for Redis pattern matching)
2. Didn't properly invalidate list caches (user lists, category lists, etc.)
3. Cleared all attachment caches aggressively instead of targeted invalidation

## Solution

### 1. Fixed Cache Invalidation Method

Updated `invalidateCacheForEntity()` to:
- Use `delPattern()` for wildcard patterns
- Call the parent `invalidateListCaches()` method to ensure lists are cleared

### 2. Override `invalidateListCaches()`

Added attachment-specific cache patterns to clear:
- `attachment:list:*` - Main list queries
- `attachment:user:*` - User-specific attachments
- `attachment:category:*` - Category-filtered lists  
- `attachment:mimetype:*` - MIME type filters
- `attachment:public:*` - Public attachment lists
- `attachment:security-status:*` - Security status filters
- `attachment:tags:*` - Tag-based queries
- `attachment:stats:*` - Statistics
- `attachment:checksum:*` - Duplicate detection cache

## How It Works

### Cache Invalidation Flow

```
Upload Attachment
    ↓
AttachmentService.uploadAttachment()
    ↓
AttachmentRepository.create()  ← BaseRepository method
    ↓
BaseRepository.invalidateListCaches()
    ↓
AttachmentRepository.invalidateListCaches()  ← Override with specific patterns
    ↓
CacheService.delPattern() × 9 patterns
    ↓
✅ All list caches cleared
```

### Async Upload Flow

```
Upload Attachment (async)
    ↓
AttachmentService.uploadAttachmentAsync()
    ↓
AttachmentRepository.create()
    ↓
invalidateListCaches()  ← Immediate cache clear
    ↓
Queue Job → Process Image
    ↓
AttachmentRepository.update()  ← Updates metadata
    ↓
invalidateListCaches()  ← Cache cleared again
    ↓
✅ Lists always show latest data
```

## Verification

### Test Cache Invalidation

1. **Get current list count:**
```bash
curl -s 'http://localhost:4040/api/v1/attachments' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  | jq '.data.total'
```

2. **Upload new attachment:**
```bash
curl -X POST 'http://localhost:4040/api/v1/attachments' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'file=@test-image.jpg'
```

3. **Check list again (should show +1):**
```bash
curl -s 'http://localhost:4040/api/v1/attachments' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  | jq '.data.total'
```

**Expected:** Count increases by 1 immediately (no cached response)

### Monitor Redis Cache

```bash
# Watch Redis keys being deleted
redis-cli MONITOR | grep -i 'del.*attachment'

# Then upload an attachment and see keys being cleared:
# DEL "attachment:list:*"
# DEL "attachment:user:*"
# ... etc
```

### Check Cache Keys

```bash
# Before upload
redis-cli KEYS "attachment:*" | wc -l

# Upload attachment

# After upload (should be fewer keys)
redis-cli KEYS "attachment:*" | wc -l
```

## Code Changes

### File: `src/core/database/repositories/attachment.repository.ts`

**Before:**
```typescript
private async invalidateCacheForEntity(id: string): Promise<void> {
  const patterns = [
    this.buildCacheKey('id', id.toString(), '*'),
    this.buildCacheKey('*')
  ]
  for (const pattern of patterns) {
    await this.cacheService.del(pattern)  // ❌ Wrong method for patterns
  }
}
```

**After:**
```typescript
private async invalidateCacheForEntity(id: string): Promise<void> {
  if (!this.cacheService) return

  // Clear specific attachment cache
  await this.cacheService.del(this.buildCacheKey('id', id))
  await this.cacheService.delPattern(this.buildCacheKey('findOne', '*'))
  
  // Clear list caches
  await this.invalidateListCaches()  // ✅ Properly clears all lists
}

protected async invalidateListCaches(): Promise<void> {
  if (!this.cacheService) return

  // Clear all attachment-specific cache patterns
  await this.cacheService.delPattern(`${this.entityName}:list:*`)
  await this.cacheService.delPattern(`${this.entityName}:user:*`)
  await this.cacheService.delPattern(`${this.entityName}:category:*`)
  // ... 6 more patterns
}
```

## Cache TTL Configuration

Current cache durations:
- **List queries:** 5 minutes (300 seconds)
- **Individual attachments:** 10 minutes (600 seconds)
- **Statistics:** 5 minutes (300 seconds)

These are automatically invalidated on:
- ✅ Create attachment
- ✅ Update attachment
- ✅ Delete attachment
- ✅ Restore attachment
- ✅ Update metadata
- ✅ Increment download count

## Benefits

1. **Immediate Visibility** - New uploads appear in lists instantly
2. **Targeted Invalidation** - Only clears relevant caches, not all Redis data
3. **Consistent Data** - No stale cache after create/update/delete operations
4. **Better Performance** - Uses pattern matching instead of clearing everything
5. **Proper Redis Usage** - Uses `delPattern()` for wildcards, `del()` for specific keys

## Related Files

- `src/core/database/repositories/base.repository.ts` - Base cache invalidation
- `src/core/database/repositories/attachment.repository.ts` - Attachment-specific patterns
- `src/core/cache/services/cache.service.ts` - Redis operations
- `src/modules/attachments/services/attachment.service.ts` - Uses repository methods

## Notes

- Cache invalidation happens **synchronously** during create/update operations
- This ensures consistency but adds ~10-20ms to write operations
- For high-traffic scenarios, consider moving to async invalidation
- The `BaseRepository` pattern ensures all entities follow the same invalidation strategy
