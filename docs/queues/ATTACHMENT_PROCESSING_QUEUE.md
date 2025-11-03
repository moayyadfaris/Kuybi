# Attachment Processing Queue

## Overview
The Attachment Processing Queue handles asynchronous image processing tasks including EXIF stripping, optimization, thumbnail generation, and metadata extraction. This queue enables fast upload responses while performing CPU-intensive operations in the background.

## Architecture

### Queue Configuration
**Queue Name**: `attachment-processing-queue`  
**Priority**: 4 (Medium-High)  
**Concurrency**: Max 20 jobs/minute  
**Timeout**: 5 minutes per job  
**Retry Strategy**: 2 attempts with exponential backoff

```typescript
// src/core/queues/config/queue.config.ts
[QueueName.ATTACHMENT_PROCESSING]: {
  limiter: {
    max: 20,        // CPU-intensive operations
    duration: 60000
  },
  defaultJobOptions: {
    priority: 4,
    timeout: 300000,  // 5 minutes
    attempts: 2
  }
}
```

## Job Types

### 1. PROCESS_IMAGE
**Purpose**: Complete image processing pipeline (EXIF stripping → optimization → thumbnails)

**Job Data**:
```typescript
interface ProcessImageJobData {
  attachmentId: string
  s3Key: string
  originalName: string
  userId: string
  category?: string
  isPublic?: boolean
  generateThumbnails?: boolean
}
```

**Processing Steps**:
1. **Download from S3**: Fetch original image from S3 storage
2. **EXIF Stripping**: Remove sensitive metadata (GPS, camera serial, etc.)
3. **Metadata Extraction**: Extract safe metadata (dimensions, format, etc.)
4. **Metadata Validation**: Security scan for malicious data
5. **Image Optimization**: Compress and resize (max 2048x2048, 85% quality)
6. **Variant Generation**: Create WebP and AVIF formats
7. **Placeholder Generation**: Low-quality image placeholder (LQIP)
8. **Thumbnail Generation**: Multiple sizes (small, medium, large)
9. **S3 Upload**: Upload optimized image and variants
10. **Database Update**: Update attachment record with metadata

**Returns**:
```typescript
{
  attachmentId: string
  originalSize: number
  optimizedSize: number
  compressionRatio: number
  thumbnailGenerated: boolean
  thumbnails: number
  metadata: number
}
```

**Example**:
```typescript
await attachmentProcessor.enqueueProcessImage({
  attachmentId: '123e4567-e89b-12d3-a456-426614174000',
  s3Key: 'uploads/user-id/2025/11/03/1234567890-abc123.jpg',
  originalName: 'photo.jpg',
  userId: 'user-123',
  category: 'profile-image',
  isPublic: true,
  generateThumbnails: true
})
```

---

### 2. GENERATE_THUMBNAILS
**Purpose**: Generate multiple thumbnail sizes for an existing image

**Job Data**:
```typescript
interface GenerateThumbnailsJobData {
  attachmentId: string
  imageUrl: string
  sizes?: Array<{ width: number; height: number; name: string }>
  isPublic?: boolean
}
```

**Default Thumbnail Sizes**:
- **Small**: 150x150 (cover fit)
- **Medium**: 300x300 (cover fit)
- **Large**: 600x600 (cover fit)

**Processing Steps**:
1. Download image from S3
2. Generate thumbnails for each size
3. Upload thumbnails to S3 with variant naming
4. Update attachment metadata with thumbnail references

**Variant Naming**:
```
Original: uploads/user-id/2025/11/03/1234567890-abc123.jpg
Small:    uploads/user-id/2025/11/03/1234567890-abc123__small.jpg
Medium:   uploads/user-id/2025/11/03/1234567890-abc123__medium.jpg
Large:    uploads/user-id/2025/11/03/1234567890-abc123__large.jpg
```

**Returns**:
```typescript
{
  attachmentId: string
  thumbnails: number
}
```

---

### 3. OPTIMIZE_IMAGE
**Purpose**: Optimize existing image without regenerating thumbnails

**Job Data**:
```typescript
interface OptimizeImageJobData {
  attachmentId: string
  buffer: Buffer
  options?: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  }
}
```

**Processing Steps**:
1. Apply compression and resizing
2. Generate WebP variant
3. Return optimization statistics

**Returns**:
```typescript
{
  attachmentId: string
  originalSize: number
  optimizedSize: number
  compressionRatio: number
}
```

---

### 4. EXTRACT_METADATA
**Purpose**: Extract and validate image metadata

**Job Data**:
```typescript
interface ExtractMetadataJobData {
  attachmentId: string
  buffer: Buffer
}
```

**Extracted Metadata**:
```typescript
{
  width: number
  height: number
  format: string
  space: string
  channels: number
  density: number
  hasAlpha: boolean
  hasProfile: boolean
  size: number
  camera?: string
  iso?: number
  focalLength?: number
  dateTaken?: string
  hasLocation: boolean
}
```

**Returns**:
```typescript
{
  attachmentId: string
  metadata: Record<string, unknown>
  validation: {
    valid: boolean
    issues: string[]
  }
}
```

---

## Upload Modes

### Synchronous Upload (Default)
**Response Time**: 3-5 seconds  
**Use Case**: Small images, immediate preview needed

```bash
curl -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@photo.jpg" \
  -F "category=profile-image"
```

**Response**:
```json
{
  "attachment": {
    "id": "123...",
    "securityStatus": "approved",
    "thumbnails": {
      "small": { "url": "...", "width": 150, "height": 150 },
      "medium": { "url": "...", "width": 300, "height": 300 }
    }
  },
  "processing": "sync"
}
```

---

### Asynchronous Upload
**Response Time**: <500ms  
**Use Case**: Large images, batch uploads, background processing

#### Method 1: Per-Request Flag
```bash
curl -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@large-photo.jpg" \
  -F "async=true"
```

#### Method 2: Environment Variable
```bash
# .env
ATTACHMENT_ASYNC_PROCESSING=true
```

#### Method 3: Override Global Setting
```bash
# If env var is true, can force sync:
curl -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@photo.jpg" \
  -F "async=false"
```

**Response**:
```json
{
  "attachment": {
    "id": "123...",
    "securityStatus": "processing",
    "metadata": { "processingStatus": "queued" }
  },
  "processing": "async"
}
```

---

## Integration Points

### API Upload Flow
```typescript
// src/modules/attachments/controllers/attachments.controller.ts
const useAsync = body.async ?? process.env.ATTACHMENT_ASYNC_PROCESSING === 'true'

const result = useAsync
  ? await this.attachmentService.uploadAttachmentAsync(file, body, userId)
  : await this.attachmentService.uploadAttachment(file, body, userId)
```

### Service Layer
```typescript
// src/modules/attachments/services/attachment.service.ts

// Synchronous: Process immediately
async uploadAttachment(file, dto, userId) {
  // 1. EXIF stripping
  // 2. Optimization
  // 3. Thumbnail generation
  // 4. S3 upload
  // 5. DB save
  return attachment
}

// Asynchronous: Upload first, queue processing
async uploadAttachmentAsync(file, dto, userId) {
  // 1. Upload original to S3
  // 2. Create DB record with "processing" status
  // 3. Queue PROCESS_IMAGE job
  return attachment
}
```

### Processor
```typescript
// src/core/queues/processors/attachment.processor.ts
@Processor(QueueName.ATTACHMENT_PROCESSING)
export class AttachmentProcessor extends WorkerHost {
  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case AttachmentJobType.PROCESS_IMAGE:
        return this.handleProcessImage(job)
      // ... other job types
    }
  }
}
```

---

## Performance Metrics

### Synchronous Upload (3MB image)
- **Total Time**: ~4.2 seconds
- **EXIF Processing**: 150ms
- **Optimization**: 1.8s
- **Thumbnail Generation**: 1.2s
- **S3 Upload**: 1.0s

### Asynchronous Upload (3MB image)
- **API Response**: ~450ms (upload to S3 only)
- **Background Processing**: ~3.5s (doesn't block user)

### Compression Ratios
- **Original JPEG**: 3.2 MB
- **Optimized JPEG**: 850 KB (73% reduction)
- **WebP Variant**: 420 KB (87% reduction)
- **Placeholder**: 8 KB (99.7% reduction)

---

## Security Features

### EXIF Stripping
Removes sensitive metadata:
- GPS coordinates (latitude, longitude, altitude)
- Camera serial numbers
- Software versions
- Timestamps (optional)
- Copyright info (preserved if requested)

### Metadata Validation
Checks for:
- Suspicious dimensions (>50,000px)
- Unsafe formats (SVG, PDF with embedded scripts)
- Excessive metadata size (>100KB)
- Malicious data hiding attempts

### Content Security
- **MIME type validation**: Server-side verification
- **File signature check**: Magic bytes validation
- **Size limits**: Enforced at API and processor level
- **Virus scanning**: Integration point available (future)

---

## Monitoring

### Queue Dashboard
Access Bull Board at `http://localhost:4050/admin/queues`

**Metrics Available**:
- Active jobs
- Waiting jobs
- Completed jobs (24hr retention)
- Failed jobs (7-day retention)
- Processing time
- Throughput (jobs/minute)

### Redis Inspection
```bash
# View job counts
redis-cli -n 1
> LLEN "bull:attachment-processing-queue:wait"
> LLEN "bull:attachment-processing-queue:active"
> LLEN "bull:attachment-processing-queue:completed"
> LLEN "bull:attachment-processing-queue:failed"

# View failed jobs
> LRANGE "bull:attachment-processing-queue:failed" 0 -1
```

### Application Logs
```bash
# Filter attachment processing logs
grep "AttachmentProcessor" logs/app.log

# Monitor success rate
grep "Image processing completed" logs/app.log | wc -l
grep "Image processing failed" logs/app.log | wc -l
```

---

## Troubleshooting

### Job Failures

#### Error: "Input file is missing"
**Cause**: Buffer serialization issue (fixed in v2.0)  
**Solution**: Ensure job passes `s3Key` instead of `buffer`

#### Error: "Failed to process image metadata"
**Cause**: Corrupted image or unsupported format  
**Solution**: Check file validation, add format to supported list

#### Error: "Timeout"
**Cause**: Image too large (>10MB) or complex processing  
**Solution**: Increase timeout in queue config or optimize input

### Performance Issues

#### Slow Processing
**Check**:
- Worker CPU usage (should be <80%)
- Redis latency (`redis-cli --latency`)
- S3 upload speed
- Image size (compress before upload)

#### High Memory Usage
**Check**:
- Concurrent job limit (reduce if needed)
- Image dimensions (enforce max size)
- Memory leaks (restart worker periodically)

### Debugging
```typescript
// Enable debug logging
// src/core/queues/processors/attachment.processor.ts
this.logger.debug({ job: job.data }, 'Processing job')
```

---

## Worker Deployment

### Development
```bash
# Start worker
npm run start:worker

# Watch logs
tail -f logs/app.log | grep AttachmentProcessor
```

### Production (PM2)
```bash
# ecosystem.config.js
{
  name: 'kuybi-worker',
  script: 'dist/worker.js',
  instances: 2,  // 2 workers for redundancy
  exec_mode: 'cluster',
  env: {
    NODE_ENV: 'production',
    REDIS_HOST: 'redis.prod',
    ATTACHMENT_ASYNC_PROCESSING: 'true'
  }
}

# Deploy
pm2 start ecosystem.config.js
pm2 save
```

### Scaling Workers
```bash
# Scale up
pm2 scale kuybi-worker 4

# Scale down
pm2 scale kuybi-worker 2

# Monitor
pm2 monit
```

---

## Best Practices

### When to Use Async Processing
✅ **Use Async**:
- Images >1MB
- Batch uploads
- User-generated content
- Non-critical uploads

❌ **Use Sync**:
- Profile images (<500KB)
- Immediate preview needed
- Real-time editing workflows

### Optimization Tips
1. **Compress before upload**: Client-side compression reduces processing time
2. **Set appropriate timeouts**: Adjust based on expected image sizes
3. **Monitor queue depth**: Alert if waiting jobs >100
4. **Cache thumbnails**: Use CDN for frequently accessed images
5. **Archive old jobs**: Clean up completed jobs regularly

### Error Handling
```typescript
try {
  await this.handleProcessImage(job)
} catch (error) {
  // Log error with context
  this.logger.error({
    error: error.message,
    attachmentId: job.data.attachmentId,
    jobId: job.id
  }, 'Processing failed')
  
  // Update attachment status
  await this.attachmentRepository.update(job.data.attachmentId, {
    securityStatus: 'failed',
    metadata: { error: error.message }
  })
  
  throw error // Let BullMQ retry
}
```

---

## API Examples

### Upload with Async Processing
```bash
curl -X POST http://localhost:4040/api/v1/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@photo.jpg" \
  -F "category=story-main-image" \
  -F "description=Hero image" \
  -F "tags=landscape,nature" \
  -F "isPublic=true" \
  -F "async=true"
```

### Check Processing Status
```bash
curl -X GET http://localhost:4040/api/v1/attachments/{id} \
  -H "Authorization: Bearer $TOKEN"
```

**Response (Processing)**:
```json
{
  "id": "123...",
  "securityStatus": "processing",
  "metadata": {
    "processingStatus": "queued"
  }
}
```

**Response (Completed)**:
```json
{
  "id": "123...",
  "securityStatus": "approved",
  "url": "https://cdn.example.com/uploads/...",
  "thumbnails": {
    "small": { "url": "...", "width": 150 },
    "medium": { "url": "...", "width": 300 }
  },
  "placeholderUrl": "...",
  "metadata": {
    "processingStatus": "completed",
    "width": 2048,
    "height": 1536,
    "optimization": {
      "originalSize": 3200000,
      "optimizedSize": 850000,
      "compressionRatio": 0.73
    }
  }
}
```

---

## Related Documentation
- [Queue Architecture](./INDEX.md)
- [Version Cleanup Queue](./VERSION_CLEANUP_QUEUE.md)
- [Session Cleanup Queue](../features/auth/SESSION_CLEANUP.md)
- [Image Processing Service](../features/attachments/IMAGE_PROCESSING.md)
- [S3 Integration](../features/attachments/S3_INTEGRATION.md)

---

## Changelog

### v2.0.0 (2025-11-03)
- **Fixed**: Buffer serialization issue (now passes S3 key)
- **Added**: Async upload support with environment flag
- **Added**: Thumbnail variant generation with public URLs
- **Added**: Placeholder image generation (LQIP)
- **Added**: Comprehensive metadata management
- **Improved**: Error handling and logging
- **Removed**: Legacy thumbnail metadata support

### v1.0.0 (Initial Release)
- Basic image processing queue
- EXIF stripping
- Simple optimization
- Single thumbnail size
