# Attachments Module Implementation

## Overview

The Attachments Module provides comprehensive file management capabilities with AWS S3 integration, advanced image processing, security scanning, and enterprise-grade features including caching, soft deletes, and orphan cleanup.

## Architecture

### Components

```
attachments/
├── entities/
│   └── attachment.entity.ts          # TypeORM entity with 29 columns
├── dto/
│   ├── upload-attachment.dto.ts      # File upload DTO
│   ├── update-attachment.dto.ts      # Metadata update DTO
│   ├── attachment-query.dto.ts       # Query/filter DTO
│   ├── attachment-response.dto.ts    # API response DTO
│   ├── presigned-url.dto.ts          # Presigned URL request/response
│   ├── attachment-stats.dto.ts       # Statistics DTO
│   └── index.ts                      # Barrel exports
├── services/
│   ├── attachment.service.ts         # Main business logic (11 methods)
│   ├── file-validation.service.ts    # MIME validation, security checks
│   ├── image-processing.service.ts   # Sharp integration (15+ methods)
│   └── s3.service.ts                 # AWS S3 operations
├── controllers/
│   └── attachments.controller.ts     # REST API endpoints
└── attachments.module.ts             # Module configuration

database/
└── repositories/
    └── attachment.repository.ts      # Data access layer (15+ methods)
```

### Database Schema

**Table**: `attachments`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (UUID v4) |
| userId | uuid | Foreign key to users table |
| path | varchar(1024) | S3 storage path |
| mimeType | varchar(150) | File MIME type |
| size | integer | File size in bytes |
| originalName | varchar(255) | Original filename |
| category | varchar(50) | File category (profile, story, document, etc.) |
| isPublic | boolean | Public access flag (default: false) |
| isEncrypted | boolean | Encryption flag (default: false) |
| encryptionKey | varchar(255) | Encryption key (if encrypted) |
| securityStatus | varchar(20) | Security scan status (pending/clean/malicious) |
| checksum | varchar(128) | SHA-256 checksum for integrity |
| downloadCount | integer | Number of downloads (default: 0) |
| lastAccessedAt | timestamptz | Last access timestamp |
| folder | varchar(100) | Organizational folder |
| description | text | File description |
| tags | jsonb | Array of tags |
| metadata | jsonb | Additional metadata (dimensions, duration, etc.) |
| scanResults | jsonb | Security scan results |
| containsPII | boolean | PII detection flag (default: false) |
| retentionPeriod | varchar(20) | Data retention period |
| expiresAt | timestamptz | Expiration timestamp |
| deletionScheduledAt | timestamptz | Scheduled deletion timestamp |
| thumbnailPath | varchar(1024) | Thumbnail S3 path |
| version | integer | Version number (default: 1) |
| createdAt | timestamptz | Creation timestamp |
| updatedAt | timestamptz | Last update timestamp |
| deletedAt | timestamptz | Soft delete timestamp |

**Indexes**:
- `idx_attachments_user` on `userId`
- `idx_attachments_security_status` on `securityStatus`
- `idx_attachments_is_public` on `isPublic`
- `idx_attachments_folder` on `folder`
- `idx_attachments_deleted_at` on `deletedAt`

**Foreign Keys**:
- `userId` → `users.id` (CASCADE on delete)

## API Endpoints

### 1. Upload Attachment

**POST** `/api/attachments`

Upload a new file with optional image processing.

**Request**:
```http
POST /api/attachments HTTP/1.1
Content-Type: multipart/form-data
Authorization: Bearer <token>

Content-Disposition: form-data; name="file"; filename="image.jpg"
Content-Type: image/jpeg
[binary data]

Content-Disposition: form-data; name="category"
profile

Content-Disposition: form-data; name="description"
Profile picture

Content-Disposition: form-data; name="tags"
["avatar", "profile"]

Content-Disposition: form-data; name="generateThumbnails"
true

Content-Disposition: form-data; name="isPublic"
false
```

**Response**:
```json
{
  "attachment": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "uuid-here",
    "originalName": "image.jpg",
    "mimeType": "image/jpeg",
    "size": 2048576,
    "path": "profile/uuid-here/2025/10/image-uuid.jpg",
    "category": "profile",
    "description": "Profile picture",
    "tags": ["avatar", "profile"],
    "isPublic": false,
    "securityStatus": "pending",
    "checksum": "sha256-hash",
    "downloadCount": 0,
    "version": 1,
    "createdAt": "2025-10-24T12:00:00Z",
    "updatedAt": "2025-10-24T12:00:00Z",
    "downloadUrl": "/api/attachments/550e8400-e29b-41d4-a716-446655440000/download"
  }
}
```

### 2. Get Attachment by ID

**GET** `/api/attachments/:id`

Retrieve attachment details by ID.

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "originalName": "image.jpg",
  "mimeType": "image/jpeg",
  "size": 2048576,
  "category": "profile",
  "isPublic": false,
  "downloadUrl": "/api/attachments/123/download",
  "previewUrl": "https://s3.amazonaws.com/bucket/thumbnails/...",
  "createdAt": "2025-10-24T12:00:00Z"
}
```

### 3. Get User Attachments

**GET** `/api/attachments/user/:userId`

Get all attachments for a specific user with filtering and pagination.

**Query Parameters**:
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `category` (string, optional)
- `mimeType` (string, optional)
- `isPublic` (boolean, optional)
- `tags` (string[], optional)
- `sortBy` (string, default: 'createdAt')
- `sortOrder` ('ASC' | 'DESC', default: 'DESC')

**Response**:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "originalName": "image.jpg",
      "category": "profile",
      "size": 2048576
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

### 4. Update Attachment Metadata

**PATCH** `/api/attachments/:id`

Update attachment metadata (description, tags, category, etc.).

**Request**:
```json
{
  "description": "Updated description",
  "tags": ["new-tag", "updated"],
  "category": "document"
}
```

**Response**: Updated attachment object

### 5. Soft Delete Attachment

**DELETE** `/api/attachments/:id`

Soft delete an attachment (sets `deletedAt` timestamp).

**Response**:
```json
{
  "message": "Attachment deleted successfully"
}
```

### 6. Hard Delete Attachment

**DELETE** `/api/attachments/:id/hard`

Permanently delete attachment from database and S3.

**Response**:
```json
{
  "message": "Attachment permanently deleted"
}
```

### 7. Restore Attachment

**POST** `/api/attachments/:id/restore`

Restore a soft-deleted attachment.

**Response**: Restored attachment object

### 8. Generate Presigned URL

**POST** `/api/attachments/:id/presigned-url`

Generate a temporary presigned URL for secure downloads.

**Request**:
```json
{
  "expiresIn": 3600
}
```

**Response**:
```json
{
  "url": "https://s3.amazonaws.com/bucket/path?X-Amz-Signature=...",
  "expiresAt": "2025-10-24T13:00:00Z",
  "expiresIn": 3600
}
```

### 9. Download Attachment

**GET** `/api/attachments/:id/download`

Download attachment file with proper headers.

**Response**: Binary file with headers:
- `Content-Type`: Original MIME type
- `Content-Disposition`: `attachment; filename="original.jpg"`
- `Content-Length`: File size

### 10. Get Statistics

**GET** `/api/attachments/stats`

Get attachment statistics across the system.

**Response**:
```json
{
  "totalAttachments": 1523,
  "totalSize": 5368709120,
  "totalDownloads": 8456,
  "averageSize": 3524891,
  "byCategory": {
    "profile": 234,
    "story": 892,
    "document": 397
  },
  "byMimeType": {
    "image/jpeg": 678,
    "image/png": 345,
    "application/pdf": 234
  }
}
```

### 11. Cleanup Orphaned Attachments

**POST** `/api/attachments/cleanup-orphaned`

Remove orphaned attachments (files without database references or vice versa).

**Query Parameters**:
- `olderThanDays` (number, default: 7)

**Response**:
```json
{
  "deleted": 23,
  "totalSize": 125829120
}
```

## Service Methods

### AttachmentService

| Method | Description |
|--------|-------------|
| `uploadAttachment()` | Upload file with validation, S3 storage, and optional image processing |
| `getById()` | Get attachment by ID |
| `getUserAttachments()` | Get user's attachments with filtering and pagination |
| `updateMetadata()` | Update attachment metadata |
| `softDelete()` | Soft delete attachment |
| `hardDelete()` | Permanently delete attachment and S3 file |
| `restore()` | Restore soft-deleted attachment |
| `generatePresignedUrl()` | Generate temporary download URL |
| `getStatistics()` | Get system-wide statistics |
| `cleanupOrphaned()` | Remove orphaned files |
| `downloadAttachment()` | Download file from S3 |

### FileValidationService

| Method | Description |
|--------|-------------|
| `validateFile()` | Comprehensive file validation (MIME, size, security) |
| `validateMimeType()` | MIME type validation against whitelist |
| `validateFileSize()` | Size validation with type-specific limits |
| `validateExtension()` | Extension validation |
| `checkSecurityThreats()` | Security threat detection (path traversal, null bytes) |
| `sanitizeFilename()` | Filename sanitization |
| `getAllowedMimeTypes()` | Get allowed MIME types by category |
| `getMaxFileSize()` | Get max file size by type |

**File Size Limits**:
- Images: 5 MB
- Videos: 100 MB
- Documents: 10 MB
- Default: 10 MB

### ImageProcessingService

| Method | Description |
|--------|-------------|
| `resize()` | Resize image to specific dimensions |
| `generateThumbnails()` | Generate multiple thumbnail sizes (small, medium, large, preview) |
| `optimize()` | Optimize image quality and size |
| `convertFormat()` | Convert image format (JPEG, PNG, WebP) |
| `crop()` | Crop image to dimensions |
| `rotate()` | Rotate image by degrees |
| `blur()` | Apply blur effect |
| `grayscale()` | Convert to grayscale |
| `addWatermark()` | Add text/image watermark |
| `getMetadata()` | Extract image metadata (dimensions, format, etc.) |

**Thumbnail Sizes**:
- Small: 150x150
- Medium: 300x300
- Large: 600x600
- Preview: 1200x1200

### S3Service

| Method | Description |
|--------|-------------|
| `upload()` | Upload file to S3 |
| `download()` | Download file from S3 |
| `delete()` | Delete file from S3 |
| `deleteMultiple()` | Batch delete files |
| `exists()` | Check if file exists |
| `copy()` | Copy file within S3 |
| `getPresignedUrl()` | Generate presigned download URL |
| `getMetadata()` | Get file metadata from S3 |
| `generateKey()` | Generate organized S3 key path |
| `getPublicUrl()` | Get public URL for public files |

**S3 Key Structure**:
```
{category}/{userId}/{year}/{month}/{filename}-{uuid}.{ext}
```

Example: `profile/abc-123/2025/10/avatar-def-456.jpg`

### AttachmentRepository

| Method | Description |
|--------|-------------|
| `findByUserId()` | Find attachments by user ID with filtering |
| `findByCategory()` | Find attachments by category |
| `findByMimeType()` | Find attachments by MIME type |
| `findByTags()` | Find attachments containing specific tags |
| `findOrphanedAttachments()` | Find orphaned attachments |
| `findBySecurityStatus()` | Find attachments by security status |
| `findExpired()` | Find expired attachments |
| `findScheduledForDeletion()` | Find attachments scheduled for deletion |
| `incrementDownloadCount()` | Increment download counter |
| `updateSecurityStatus()` | Update security scan status |
| `getStatistics()` | Get repository statistics |
| `softDelete()` | Soft delete attachment |
| `hardDelete()` | Hard delete attachment |
| `restore()` | Restore soft-deleted attachment |
| `findByIdWithOptions()` | Find by ID with custom options (include deleted, etc.) |

**Caching**: 10-minute TTL via BaseRepository integration

## Configuration

### Environment Variables

```bash
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name

# File Upload Limits
MAX_FILE_SIZE_IMAGE=5242880      # 5 MB
MAX_FILE_SIZE_VIDEO=104857600    # 100 MB
MAX_FILE_SIZE_DOCUMENT=10485760  # 10 MB
MAX_FILE_SIZE_DEFAULT=10485760   # 10 MB

# Image Processing
IMAGE_QUALITY=80                  # JPEG quality (0-100)
THUMBNAIL_SMALL_SIZE=150
THUMBNAIL_MEDIUM_SIZE=300
THUMBNAIL_LARGE_SIZE=600

# Security
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,application/pdf
SCAN_UPLOADED_FILES=true

# Retention
ORPHAN_CLEANUP_DAYS=7
ATTACHMENT_EXPIRY_DAYS=365
```

### Module Registration

```typescript
import { AttachmentsModule } from './attachments/attachments.module'

@Module({
  imports: [
    AttachmentsModule,
    // other modules...
  ]
})
export class AppModule {}
```

## Usage Examples

### Upload with Image Processing

```typescript
import { AttachmentService } from './attachments/services/attachment.service'

@Injectable()
export class ProfileService {
  constructor(private attachmentService: AttachmentService) {}

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const attachment = await this.attachmentService.uploadAttachment(
      file,
      {
        category: 'profile',
        description: 'User avatar',
        tags: ['avatar', 'profile-picture'],
        generateThumbnails: true,
        isPublic: true
      },
      userId
    )
    
    return attachment
  }
}
```

### Generate Secure Download Link

```typescript
const { url, expiresAt } = await this.attachmentService.generatePresignedUrl(
  attachmentId,
  { expiresIn: 3600 } // 1 hour
)

// Send URL to user
// URL expires after 1 hour
```

### Scheduled Orphan Cleanup

```typescript
import { Cron, CronExpression } from '@nestjs/schedule'

@Injectable()
export class AttachmentCleanupService {
  constructor(private attachmentService: AttachmentService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOrphanedFiles() {
    const result = await this.attachmentService.cleanupOrphaned(7)
    console.log(`Cleaned up ${result.deleted} orphaned files (${result.totalSize} bytes)`)
  }
}
```

### Query User Attachments

```typescript
const attachments = await this.attachmentService.getUserAttachments(
  userId,
  {
    page: 1,
    limit: 20,
    category: 'story',
    sortBy: 'createdAt',
    sortOrder: 'DESC'
  }
)

console.log(`Found ${attachments.total} story attachments`)
```

## Security Features

### 1. File Validation
- MIME type whitelist enforcement
- File extension validation
- Size limit enforcement by file type
- Filename sanitization (remove special characters, path traversal attempts)
- Null byte injection prevention

### 2. Security Scanning
- Security status tracking (pending/clean/malicious)
- Checksum verification (SHA-256)
- PII detection flag
- Scan results stored in JSONB

### 3. Access Control
- User ownership validation
- Public/private access flags
- Presigned URLs with expiration
- Bearer token authentication required

### 4. Data Protection
- Optional encryption support
- Encryption key storage
- Soft delete for data recovery
- Scheduled deletion support

## Performance Optimizations

### 1. Caching
- Repository-level caching (10-min TTL)
- Cache invalidation on updates/deletes
- Redis-backed via BaseRepository

### 2. Database Indexes
- Indexed on userId, category, securityStatus, isPublic, deletedAt
- Optimized for common query patterns

### 3. S3 Optimization
- Multipart upload for large files
- CloudFront CDN integration ready
- Public URL caching for public files

### 4. Image Processing
- Lazy thumbnail generation
- Quality optimization (80% JPEG quality default)
- Format conversion to WebP for smaller sizes

## Monitoring & Logging

### Structured Logging

All services use Pino logger with context:

```typescript
this.logger.info({ userId, attachmentId, size }, 'File uploaded successfully')
this.logger.error({ error, attachmentId }, 'Failed to delete from S3')
```

### Metrics to Track

- Upload count by category
- Download count trends
- Storage usage by user/category
- Failed uploads/downloads
- Orphaned file cleanup stats
- Security scan results

## Migration

Run the migration to create the attachments table:

```bash
npm run migration:run
```

Migration file: `1712000400000-create-attachments-table.ts`

**Note:** Attachment IDs use UUID v4 format for better distribution and scalability.

## Testing

### Unit Tests

```bash
npm run test
```

### Integration Tests

```bash
npm run test:integration
```

Test coverage should include:
- File upload with validation
- Image processing operations
- S3 upload/download
- Presigned URL generation
- Soft/hard delete operations
- Orphan cleanup
- Repository caching

## Troubleshooting

### Common Issues

**1. Upload fails with "File validation failed"**
- Check MIME type is in allowed list
- Verify file size is within limits
- Check filename doesn't contain special characters

**2. S3 upload fails**
- Verify AWS credentials are correct
- Check S3 bucket exists and has proper permissions
- Ensure bucket region matches AWS_REGION

**3. Thumbnails not generated**
- Ensure Sharp is installed (`npm install sharp`)
- Check file is a valid image format
- Verify `generateThumbnails: true` in upload DTO

**4. Cache not working**
- Verify Redis is running
- Check Redis connection configuration
- Ensure CacheService is properly injected

## Future Enhancements

- [ ] Video transcoding support
- [ ] Advanced virus scanning integration
- [ ] Automatic image optimization on upload
- [ ] CDN integration for global delivery
- [ ] Duplicate detection using checksums
- [ ] Attachment versioning system
- [ ] Batch upload support
- [ ] Direct S3 upload (presigned POST)
- [ ] Advanced search with Elasticsearch
- [ ] Attachment sharing with permissions

## Related Documentation

- [Enterprise Database Schema](../../ENTERPRISE_DATABASE.md)
- [Story Attachments](../stories/story-attachments.md)
- [AWS S3 Integration](../../infrastructure/s3-integration.md)
- [Image Processing Guide](../../guides/image-processing.md)

## Support

For issues or questions, contact the development team or refer to the main project documentation.
