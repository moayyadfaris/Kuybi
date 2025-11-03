# Attachment System Issues Analysis

**Date:** November 3, 2025  
**Issues Identified:**
1. `securityStatus` field stuck on "processing" 
2. Multiple records (3x) created from single upload API call

---

## Issue #1: Security Status Stuck on "processing"

### Root Cause

The `securityStatus` field is being set to `"processing"` in the **async upload method** but is **never updated** to a final status after processing completes.

### Current Flow

**Sync Upload (`uploadAttachment`):**
```typescript
// Line 189: Sets securityStatus to 'pending'
securityStatus: 'pending'
```
✅ **Status:** `pending` (correct for synchronous processing)

**Async Upload (`uploadAttachmentAsync`):**
```typescript
// Line 274: Sets securityStatus to 'processing'
securityStatus: 'processing',
metadata: { processingStatus: 'queued' }
```
❌ **Problem:** Status remains `"processing"` forever

**Async Processor (`attachment.processor.ts`):**
```typescript
// Line 226: Updates metadata.processingStatus but NOT securityStatus
metadata.processingStatus = 'completed'

await this.attachmentRepository.update(attachmentId, {
  size: processedBuffer.length,
  thumbnailPath,
  metadata,  // ✅ Contains processingStatus: 'completed'
  mimeType: contentType,
  isPublic: publicAccess
  // ❌ MISSING: securityStatus update!
})
```

### Solution

The processor should update **both** `metadata.processingStatus` AND `securityStatus`:

```typescript
// In attachment.processor.ts, line 226+
await this.attachmentRepository.update(attachmentId, {
  size: processedBuffer.length,
  thumbnailPath,
  metadata,
  mimeType: contentType,
  isPublic: publicAccess,
  securityStatus: 'completed'  // ✅ ADD THIS
})
```

### Recommended Security Status Values

Based on the current implementation:
- `pending` - Initial status for sync uploads
- `processing` - Currently being processed in queue
- `completed` - Processing finished successfully
- `failed` - Processing failed (should add error handling)
- `scanned` - Virus scan completed (if implementing security scanning)
- `quarantined` - Security issue detected

---

## Issue #2: Multiple Records from Single Upload

### Investigation Results

After reviewing the codebase, I found **NO CODE** that would create multiple records. The controller has a **single endpoint** and the service methods create **exactly one record**.

### Possible Causes

#### 1. **Client-Side Duplicate Requests** (Most Likely)
- Frontend making multiple API calls
- Form double-submission
- Upload retry logic without proper deduplication
- Network issues causing request retries

**Evidence:**
- No duplicate creation in backend code
- Controller has single `POST /v1/attachments` endpoint
- Service methods call `repository.create()` only once

#### 2. **Database Triggers** (Unlikely but check)
```sql
-- Check for triggers on attachments table
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'attachments';
```

#### 3. **Migration Issues** (Check)
- Old migration might have insert statements
- Seed data creating test records

#### 4. **Proxy/Load Balancer Retries**
- Nginx/load balancer retrying requests
- API Gateway duplicating requests

### Verification Steps

**Step 1: Check Database Triggers**
```bash
npm run db:query "SELECT trigger_name, event_manipulation, action_statement FROM information_schema.triggers WHERE event_object_table = 'attachments';"
```

**Step 2: Check Request Logs**
```typescript
// Add to controller upload method
console.log('Upload request received:', {
  userId: req.user?.userId,
  filename: file.originalname,
  timestamp: new Date().toISOString(),
  requestId: req.headers['x-request-id']
})
```

**Step 3: Database Query to Check Duplicates**
```sql
-- Find duplicate attachments (same checksum, same user, within 1 minute)
SELECT 
  checksum, 
  "userId", 
  "originalName",
  COUNT(*) as count,
  array_agg(id) as attachment_ids,
  array_agg("createdAt") as created_times
FROM attachments
WHERE "deletedAt" IS NULL
GROUP BY checksum, "userId", "originalName"
HAVING COUNT(*) > 1
ORDER BY MAX("createdAt") DESC
LIMIT 20;
```

**Step 4: Enable Request Logging**
Add to `main.ts`:
```typescript
app.use((req, res, next) => {
  const requestId = crypto.randomUUID()
  req.headers['x-request-id'] = requestId
  console.log(`[${requestId}] ${req.method} ${req.url}`)
  next()
})
```

### Solutions

#### Solution 1: Add Checksum Deduplication

Update `attachment.service.ts`:

```typescript
async uploadAttachment(
  file: MulterFile,
  dto: UploadAttachmentDto,
  userId: string
): Promise<AttachmentResponseDto> {
  // ... existing validation ...
  
  const checksum = crypto.createHash('sha256').update(processedBuffer).digest('hex')
  
  // Check for existing attachment with same checksum (prevent duplicates)
  if (!dto.allowDuplicates) {
    const existing = await this.attachmentRepository.findOne({
      where: {
        userId,
        checksum,
        deletedAt: null
      }
    })
    
    if (existing) {
      this.logger.warn({ checksum, userId }, 'Duplicate upload detected, returning existing attachment')
      return this.formatAttachmentResponse(existing)
    }
  }
  
  // ... continue with upload ...
}
```

#### Solution 2: Add Idempotency Key Support

```typescript
// In UploadAttachmentDto
@IsOptional()
@IsString()
idempotencyKey?: string

// In service
async uploadAttachment(...) {
  if (dto.idempotencyKey) {
    const cached = await this.cacheService.get(`upload:${dto.idempotencyKey}`)
    if (cached) {
      return JSON.parse(cached)
    }
  }
  
  // ... process upload ...
  
  if (dto.idempotencyKey) {
    await this.cacheService.set(
      `upload:${dto.idempotencyKey}`, 
      JSON.stringify(result),
      3600 // 1 hour
    )
  }
  
  return result
}
```

#### Solution 3: Add Request Tracking Middleware

```typescript
// middleware/request-deduplication.middleware.ts
export class RequestDeduplicationMiddleware implements NestMiddleware {
  constructor(private readonly cacheService: CacheService) {}
  
  async use(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'POST' && req.path.includes('/attachments')) {
      const requestHash = crypto
        .createHash('md5')
        .update(`${req.user?.userId}:${req.headers['content-length']}:${Date.now()}`)
        .digest('hex')
      
      const inProgress = await this.cacheService.get(`upload:progress:${requestHash}`)
      if (inProgress) {
        return res.status(429).json({
          message: 'Duplicate upload in progress',
          requestHash
        })
      }
      
      await this.cacheService.set(`upload:progress:${requestHash}`, '1', 60)
      
      res.on('finish', async () => {
        await this.cacheService.del(`upload:progress:${requestHash}`)
      })
    }
    
    next()
  }
}
```

---

## Current Code Analysis

### Upload Flow Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /api/v1/attachments
       │ multipart/form-data
       ▼
┌─────────────────────────────┐
│ AttachmentsController       │
│ - Validates auth            │
│ - Checks permissions        │
│ - Calls service             │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│ AttachmentService           │
│                             │
│ async===true?               │
├──────┬──────────────────────┤
│  NO  │         YES          │
│      │                      │
│ uploadAttachment()          │ uploadAttachmentAsync()
│ - Validate                  │ - Validate
│ - Process image             │ - Upload original to S3
│ - EXIF strip                │ - Create record (status: 'processing')
│ - Optimize                  │ - Queue job
│ - Upload to S3              │ - Return immediately
│ - Create record             │
│   (status: 'pending')       │
│ - Return result             │
└──────┬──────────────────────┴──────┬──────────┘
       │                              │
       ▼                              ▼
   ✅ DONE                    ┌──────────────────┐
   (1 record)                 │ BullMQ Queue     │
                              │ ATTACHMENT_      │
                              │ PROCESSING       │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ AttachmentProcessor
                              │ - Download from S3
                              │ - EXIF strip
                              │ - Optimize
                              │ - Thumbnails
                              │ - Upload variants
                              │ - Update record
                              │   ❌ MISSING:
                              │   securityStatus
                              └──────────────────┘
```

### Record Creation Points

**Point 1: Sync Upload** (`attachment.service.ts:189`)
```typescript
const attachment = await this.attachmentRepository.create({
  userId,
  originalName: file.originalname,
  mimeType: storedMimeType,
  size: processedBuffer.length,
  path: storageKey,
  category: dto.category,
  description: dto.description,
  tags: dto.tags || [],
  isPublic,
  checksum,
  securityStatus: 'pending',  // ✅
  thumbnailPath,
  metadata
})
```
**Result:** 1 record created

**Point 2: Async Upload** (`attachment.service.ts:274`)
```typescript
const attachment = await this.attachmentRepository.create({
  userId,
  originalName: file.originalname,
  mimeType: file.mimetype,
  size: file.size,
  path: storageKey,
  category: dto.category,
  description: dto.description,
  tags: dto.tags || [],
  isPublic,
  checksum,
  securityStatus: 'processing',  // ❌ Never updated
  metadata: { processingStatus: 'queued' }
})
```
**Result:** 1 record created

**Point 3: Processor** (`attachment.processor.ts:226`)
```typescript
await this.attachmentRepository.update(attachmentId, {
  size: processedBuffer.length,
  thumbnailPath,
  metadata,
  mimeType: contentType,
  isPublic: publicAccess
  // ❌ DOES NOT UPDATE securityStatus
})
```
**Result:** 0 records created (updates existing)

**Total:** Maximum 1 record per upload API call

---

## Recommendations

### Immediate Fixes (Priority 1)

1. **Fix securityStatus Update**
   ```typescript
   // In attachment.processor.ts
   await this.attachmentRepository.update(attachmentId, {
     securityStatus: 'completed',  // ADD THIS
     // ... rest of updates
   })
   ```

2. **Add Error Handling for Failed Processing**
   ```typescript
   catch (error) {
     await this.attachmentRepository.update(attachmentId, {
       securityStatus: 'failed',
       metadata: {
         processingStatus: 'failed',
         error: error.message
       }
     })
     throw error
   }
   ```

### Short-term Improvements (Priority 2)

3. **Add Checksum Deduplication**
   - Check for existing attachment with same checksum
   - Return existing if found within last hour
   - Configurable via `allowDuplicates` flag

4. **Add Request Logging**
   - Log all upload requests with unique request ID
   - Track duplicate requests from same user
   - Monitor for unusual patterns

### Long-term Enhancements (Priority 3)

5. **Implement Idempotency**
   - Support `Idempotency-Key` header
   - Cache responses for 1 hour
   - Prevent duplicate processing

6. **Add Security Scanning**
   - Integrate virus scanning (ClamAV, VirusTotal API)
   - Update `securityStatus` to `scanned`, `quarantined`, etc.
   - Implement async security queue

7. **Enhanced Monitoring**
   - Track upload success/failure rates
   - Alert on duplicate uploads
   - Monitor processing queue depth

---

## Investigation Commands

### Check Current Database State

```sql
-- Count attachments by securityStatus
SELECT "securityStatus", COUNT(*) as count
FROM attachments
WHERE "deletedAt" IS NULL
GROUP BY "securityStatus"
ORDER BY count DESC;

-- Find attachments stuck in processing
SELECT id, "originalName", "userId", "createdAt", "updatedAt"
FROM attachments
WHERE "securityStatus" = 'processing'
  AND "deletedAt" IS NULL
  AND "createdAt" < NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC
LIMIT 20;

-- Check for duplicate uploads (same file, same user)
SELECT 
  checksum,
  "userId",
  "originalName",
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY "createdAt") as ids,
  MIN("createdAt") as first_upload,
  MAX("createdAt") as last_upload,
  EXTRACT(EPOCH FROM (MAX("createdAt") - MIN("createdAt"))) as seconds_apart
FROM attachments
WHERE "deletedAt" IS NULL
  AND checksum IS NOT NULL
GROUP BY checksum, "userId", "originalName"
HAVING COUNT(*) > 1
ORDER BY MAX("createdAt") DESC
LIMIT 20;
```

### Fix Existing Records

```sql
-- Update stuck processing records to completed
-- (Only if you've deployed the processor fix)
UPDATE attachments
SET "securityStatus" = 'completed'
WHERE "securityStatus" = 'processing'
  AND metadata->>'processingStatus' = 'completed'
  AND "deletedAt" IS NULL;

-- Or if metadata isn't updated, mark as pending for manual review
UPDATE attachments
SET "securityStatus" = 'pending'
WHERE "securityStatus" = 'processing'
  AND "createdAt" < NOW() - INTERVAL '1 hour'
  AND "deletedAt" IS NULL;
```

---

## Testing Plan

### Test 1: Verify Single Record Creation
```bash
# Upload a file
curl -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-image.jpg" \
  -F "category=test" \
  -F "async=true"

# Check database
psql -d kuybi -c "SELECT COUNT(*) FROM attachments WHERE \"userId\" = '<user-id>' AND \"createdAt\" > NOW() - INTERVAL '1 minute';"
# Expected: 1
```

### Test 2: Verify securityStatus Update
```bash
# Upload with async processing
curl -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-image.jpg" \
  -F "async=true"

# Wait 30 seconds for processing

# Check status
psql -d kuybi -c "SELECT id, \"securityStatus\", metadata->>'processingStatus' FROM attachments ORDER BY \"createdAt\" DESC LIMIT 1;"
# Expected: securityStatus = 'completed', processingStatus = 'completed'
```

### Test 3: Duplicate Detection
```bash
# Upload same file twice quickly
curl -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-image.jpg" \
  -F "allowDuplicates=false"

curl -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-image.jpg" \
  -F "allowDuplicates=false"

# Check database
psql -d kuybi -c "SELECT checksum, COUNT(*) FROM attachments WHERE \"createdAt\" > NOW() - INTERVAL '1 minute' GROUP BY checksum HAVING COUNT(*) > 1;"
# Expected: 0 rows (no duplicates)
```

---

## Summary

### Issue #1: securityStatus "processing"
- **Cause:** Processor doesn't update `securityStatus` field
- **Impact:** Database shows incorrect status, unclear if processing completed
- **Fix:** Add `securityStatus: 'completed'` to processor update call
- **Effort:** 5 minutes

### Issue #2: 3 Records from 1 Upload
- **Cause:** NOT in backend code - likely client-side issue
- **Evidence:** No duplicate creation logic found
- **Investigation Needed:** 
  - Check frontend code for duplicate requests
  - Check network logs for retries
  - Query database for actual duplicate patterns
- **Preventive Fixes:**
  - Add checksum deduplication
  - Implement idempotency keys
  - Add request tracking
- **Effort:** 2-4 hours

### Next Steps
1. ✅ Deploy `securityStatus` fix immediately
2. 🔍 Run database queries to confirm duplicate pattern
3. 🔍 Check frontend upload implementation
4. 🔧 Implement checksum deduplication
5. 📊 Add monitoring and alerting
