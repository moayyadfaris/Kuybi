# 🔌 API Endpoints

Complete reference for all Kuybi API endpoints with request/response examples.

## Table of Contents

- [Authentication](#authentication)
- [Users](#users)
- [Categories](#categories)
- [Stories](#stories)
- [Attachments](#attachments)
- [Audit Logs](#audit-logs-admin)
- [ACL & Permissions](#acl--permissions-admin)
- [Health Check](#health-check)
- [Common Patterns](#common-patterns)

---

## Authentication

### Login
```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@kuybi.dev",
  "password": "Admin@123"
}

# Response
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "uuid", "email": "admin@kuybi.dev", "role": "super-admin" }
}
```

### Refresh Token
```bash
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Logout
```bash
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>
```

---

## Users

### Get Current User Profile
```bash
GET /api/v1/users/me
Authorization: Bearer <accessToken>

# Response
{
  "id": "uuid",
  "email": "admin@kuybi.dev",
  "name": "Admin User",
  "role": "super-admin",
  "isActive": true,
  "createdAt": "2025-11-04T00:00:00.000Z"
}
```

### List Users (Admin)
```bash
GET /api/v1/users?page=1&limit=20&role=admin&isActive=true
Authorization: Bearer <accessToken>

# Response
{
  "data": [...],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

### Create User (Admin)
```bash
POST /api/v1/users
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "SecurePass123!",
  "role": "editor"
}
```

---

## Categories

### List Categories
```bash
GET /api/v1/categories?page=1&limit=100&includeCounts=true
Authorization: Bearer <accessToken>

# Response
{
  "results": [
    {
      "id": "uuid",
      "name": "Technology",
      "slug": "technology",
      "description": "Tech stories",
      "isActive": true,
      "storyCount": 42
    }
  ],
  "total": 10,
  "pagination": { "page": 1, "limit": 100, "totalPages": 1 }
}
```

### Create Category (Admin)
```bash
POST /api/v1/categories
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Science",
  "description": "Scientific articles",
  "isActive": true
}
```

---

## Stories

### List Stories
```bash
GET /api/v1/stories?page=1&limit=20&status=published&categoryId=uuid
Authorization: Bearer <accessToken>

# Response
{
  "data": [
    {
      "id": "uuid",
      "title": "Amazing Story",
      "slug": "amazing-story",
      "excerpt": "Brief description...",
      "status": "published",
      "categories": [...],
      "tags": [...],
      "author": {...},
      "publishedAt": "2025-11-04T00:00:00.000Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

### Create Story
```bash
POST /api/v1/stories
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "title": "My New Story",
  "content": "<p>Story content in HTML</p>",
  "excerpt": "Brief description",
  "categoryIds": ["uuid1", "uuid2"],
  "tagIds": ["uuid3", "uuid4"],
  "featuredImageId": "uuid5",
  "status": "draft"
}
```

### Publish Story
```bash
POST /api/v1/stories/:id/publish
Authorization: Bearer <accessToken>

# Response
{
  "id": "uuid",
  "status": "published",
  "publishedAt": "2025-11-04T12:00:00.000Z"
}
```

---

## Attachments

### Upload File
```bash
POST /api/v1/attachments
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data

file: <binary>
category: "image"
description: "Profile picture"
isPublic: true
generateThumbnails: true

# Response
{
  "id": "uuid",
  "url": "https://s3.amazonaws.com/...",
  "originalImageUrl": "https://s3.amazonaws.com/...",
  "downloadUrl": "/api/attachments/uuid/download",
  "thumbnails": {
    "small": { "url": "...", "width": 150, "height": 150 },
    "medium": { "url": "...", "width": 300, "height": 300 },
    "large": { "url": "...", "width": 600, "height": 600 }
  }
}
```

### List Attachments
```bash
GET /api/v1/attachments?page=1&limit=20&category=image&isPublic=true
Authorization: Bearer <accessToken>
```

---

## Audit Logs (Admin)

### Search Audit Logs
```bash
GET /api/v1/audit?page=1&limit=50&action=CREATE&entityType=Story&userId=uuid
Authorization: Bearer <accessToken>

# Response
{
  "data": [
    {
      "id": "uuid",
      "action": "CREATE",
      "entityType": "Story",
      "entityId": "uuid",
      "userId": "uuid",
      "changes": {...},
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "timestamp": "2025-11-04T12:00:00.000Z"
    }
  ],
  "total": 1000,
  "page": 1,
  "limit": 50
}
```

---

## ACL & Permissions (Admin)

### List Roles
```bash
GET /api/v1/acl/roles
Authorization: Bearer <accessToken>

# Response
[
  {
    "id": "uuid",
    "name": "super-admin",
    "description": "Full system access",
    "permissions": [...]
  }
]
```

### Assign Role to User
```bash
POST /api/v1/acl/users/:userId/roles
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "roleId": "uuid",
  "expiresAt": "2026-01-01T00:00:00.000Z"
}
```

---

## Health Check

### Check API Health
```bash
GET /api/health

# Response
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

---

## Common Patterns

### Query Parameters

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `search`: Search term for text fields
- `orderBy`: Sort field (e.g., `createdAt`, `name`)
- `orderDirection`: Sort direction (`ASC` or `DESC`)
- `includeCounts`: Include related counts (default: false)

### Response Format

#### Success Response
```json
{
  "success": true,
  "data": { ... },
  "requestId": "uuid"
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Resource not found",
    "statusCode": 404,
    "timestamp": "2025-11-04T12:00:00.000Z",
    "path": "/api/v1/stories/invalid-id"
  },
  "requestId": "uuid"
}
```

### Authentication Headers

All protected endpoints require:
```
Authorization: Bearer <accessToken>
```

### Rate Limiting

- **Default**: 20 requests per minute per IP
- **Response Headers**:
  - `X-RateLimit-Limit`: 20
  - `X-RateLimit-Remaining`: 15
  - `X-RateLimit-Reset`: 1699084800

---

## Interactive Documentation

For interactive API exploration with request/response schemas and try-it-out functionality:

**Swagger UI**: http://localhost:4040/api/docs

---

## Related Documentation

- [API Reference](./API_REFERENCE.md) - High-level API overview
- [Authentication Module](./features/auth/README.md) - Auth implementation details
- [ACL Module](./features/acl/README.md) - Access control guide
- [Testing Guide](./guides/TESTING_APPROACH.md) - API testing examples
