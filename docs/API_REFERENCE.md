# API Reference - Kuybi NestJS

## Base URL

```
http://localhost:4040/api/v1
```

All API endpoints are prefixed with `/api/v1` for versioning.

## Authentication

Most endpoints require authentication via JWT Bearer token:

```bash
Authorization: Bearer <your-jwt-token>
```

Get your token by logging in:
```bash
POST /api/v1/auth/login
```

---

## 🔐 Authentication Endpoints

### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}
```

### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

### Get User Sessions
```http
GET /api/v1/auth/sessions
Authorization: Bearer <token>
```

---

## 👥 Session Management

### List Sessions
```http
GET /api/v1/sessions
Authorization: Bearer <token>
```

### Get Session by ID
```http
GET /api/v1/sessions/:id
Authorization: Bearer <token>
```

### Get Session Statistics
```http
GET /api/v1/sessions/stats
Authorization: Bearer <token>
```

### Delete Session
```http
DELETE /api/v1/sessions/:id
Authorization: Bearer <token>
```

### Revoke All Sessions
```http
DELETE /api/v1/sessions/all/revoke
Authorization: Bearer <token>
```

### Revoke Sessions by Device Type
```http
DELETE /api/v1/sessions/device/:type
Authorization: Bearer <token>
```

### Extend Session
```http
POST /api/v1/sessions/:id/extend
Authorization: Bearer <token>
```

### Manual Cleanup
```http
POST /api/v1/sessions/cleanup
Authorization: Bearer <token>
```

---

## 🎭 ACL - Roles

### Create Role
```http
POST /api/v1/roles
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "editor",
  "description": "Content editor role",
  "priority": 60,
  "isActive": true
}
```

### List All Roles
```http
GET /api/v1/roles
Authorization: Bearer <token>
```

### List Active Roles
```http
GET /api/v1/roles/active
Authorization: Bearer <token>
```

### Get Role by ID
```http
GET /api/v1/roles/:id
Authorization: Bearer <token>
```

### Get Role Permissions
```http
GET /api/v1/roles/:id/permissions
Authorization: Bearer <token>
```

### Update Role
```http
PUT /api/v1/roles/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Updated description",
  "priority": 65,
  "isActive": true
}
```

### Assign Permissions to Role
```http
POST /api/v1/roles/:id/permissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "permissionIds": [1, 2, 3, 4]
}
```

### Remove Permissions from Role
```http
DELETE /api/v1/roles/:id/permissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "permissionIds": [1, 2]
}
```

### Delete Role
```http
DELETE /api/v1/roles/:id
Authorization: Bearer <token>
```

---

## 🔑 ACL - Permissions

### Create Permission
```http
POST /api/v1/permissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "create",
  "subject": "Story",
  "conditions": { "userId": "${userId}" },
  "fields": ["title", "content"],
  "inverted": false,
  "reason": "Users can create their own stories"
}
```

### List All Permissions
```http
GET /api/v1/permissions
Authorization: Bearer <token>
```

### Filter Permissions by Action
```http
GET /api/v1/permissions?action=create
Authorization: Bearer <token>
```

### Filter Permissions by Subject
```http
GET /api/v1/permissions?subject=Story
Authorization: Bearer <token>
```

### Filter by Both
```http
GET /api/v1/permissions?action=update&subject=Story
Authorization: Bearer <token>
```

### Get Permission by ID
```http
GET /api/v1/permissions/:id
Authorization: Bearer <token>
```

### Update Permission
```http
PUT /api/v1/permissions/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Updated reason",
  "fields": ["title", "content", "summary"]
}
```

### Delete Permission
```http
DELETE /api/v1/permissions/:id
Authorization: Bearer <token>
```

---

## 👤 User Role Assignments

### Get User's Roles
```http
GET /api/v1/users/:userId/roles
Authorization: Bearer <token>
```

### Assign Role to User
```http
POST /api/v1/users/:userId/roles
Authorization: Bearer <token>
Content-Type: application/json

{
  "roleId": 2,
  "isActive": true,
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

### Revoke Role from User
```http
DELETE /api/v1/users/:userId/roles/:roleId
Authorization: Bearer <token>
```

### Activate User Role
```http
POST /api/v1/users/:userId/roles/:roleId/activate
Authorization: Bearer <token>
```

### Deactivate User Role
```http
POST /api/v1/users/:userId/roles/:roleId/deactivate
Authorization: Bearer <token>
```

---

## 📰 Stories

### Create Story
```http
POST /api/v1/stories
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "My Story",
  "content": "Story content...",
  "summary": "Brief summary",
  "status": "draft",
  "type": "article"
}
```

**Required Permission:** `create:Story`

### List Stories
```http
GET /api/v1/stories
Authorization: Bearer <token>
```

### Get Story Statistics
```http
GET /api/v1/stories/stats
Authorization: Bearer <token>
```

### Get Stories by User
```http
GET /api/v1/stories/user/:userId
Authorization: Bearer <token>
```

### Get Stories by Status
```http
GET /api/v1/stories/status/:status
Authorization: Bearer <token>
```

### Get Stories by Type
```http
GET /api/v1/stories/type/:type
Authorization: Bearer <token>
```

### Get Story Children
```http
GET /api/v1/stories/:id/children
Authorization: Bearer <token>
```

### Get Story by ID
```http
GET /api/v1/stories/:id
Authorization: Bearer <token>
```

### Update Story
```http
PATCH /api/v1/stories/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated title",
  "content": "Updated content"
}
```

**Required Permission:** `update:Story`

### Update Story Status
```http
PATCH /api/v1/stories/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "published"
}
```

**Required Permission:** `publish:Story`

### Delete Story (Soft Delete)
```http
DELETE /api/v1/stories/:id
Authorization: Bearer <token>
```

**Required Permission:** `delete:Story`

### Hard Delete Story
```http
DELETE /api/v1/stories/:id/hard
Authorization: Bearer <token>
```

**Required Permission:** `manage:all` (Super Admin only)

### Restore Story
```http
POST /api/v1/stories/:id/restore
Authorization: Bearer <token>
```

**Required Permission:** `restore:Story`

### Add Attachments to Story
```http
POST /api/v1/stories/:id/attachments
Authorization: Bearer <token>
Content-Type: application/json

{
  "attachmentIds": [1, 2, 3]
}
```

### Remove Attachments from Story
```http
DELETE /api/v1/stories/:id/attachments
Authorization: Bearer <token>
Content-Type: application/json

{
  "attachmentIds": [1, 2]
}
```

### Get Story Attachments
```http
GET /api/v1/stories/:id/attachments
Authorization: Bearer <token>
```

### Add Tags to Story
```http
POST /api/v1/stories/:id/tags
Authorization: Bearer <token>
Content-Type: application/json

{
  "tagIds": [1, 2, 3]
}
```

### Remove Tags from Story
```http
DELETE /api/v1/stories/:id/tags
Authorization: Bearer <token>
Content-Type: application/json

{
  "tagIds": [1]
}
```

### Get Story Tags
```http
GET /api/v1/stories/:id/tags
Authorization: Bearer <token>
```

---

## 📁 Categories

### Create Category
```http
POST /api/v1/categories
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Sports",
  "description": "Sports content",
  "isActive": true
}
```

**Required Permission:** `create:Category`

### List Categories
```http
GET /api/v1/categories
Authorization: Bearer <token>
```

### List Active Categories
```http
GET /api/v1/categories/active
Authorization: Bearer <token>
```

### Get Category Statistics
```http
GET /api/v1/categories/stats
Authorization: Bearer <token>
```

### Get Category by Slug
```http
GET /api/v1/categories/slug/:slug
Authorization: Bearer <token>
```

### Get Category by ID
```http
GET /api/v1/categories/:id
Authorization: Bearer <token>
```

### Update Category
```http
PATCH /api/v1/categories/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "isActive": true
}
```

**Required Permission:** `update:Category`

### Delete Category (Soft Delete)
```http
DELETE /api/v1/categories/:id
Authorization: Bearer <token>
```

**Required Permission:** `delete:Category`

### Restore Category
```http
POST /api/v1/categories/:id/restore
Authorization: Bearer <token>
```

**Required Permission:** `restore:Category`

### Hard Delete Category
```http
DELETE /api/v1/categories/:id/hard
Authorization: Bearer <token>
```

**Required Permission:** `manage:all` (Super Admin only)

---

## 🏷️ Tags

### Create Tag
```http
POST /api/v1/tags
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Technology",
  "isSystem": false
}
```

### List Tags
```http
GET /api/v1/tags
Authorization: Bearer <token>
```

### List System Tags
```http
GET /api/v1/tags/system
Authorization: Bearer <token>
```

### Get Tag by ID
```http
GET /api/v1/tags/:id
Authorization: Bearer <token>
```

### Update Tag
```http
PATCH /api/v1/tags/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Tag"
}
```

### Delete Tag (Soft Delete)
```http
DELETE /api/v1/tags/:id
Authorization: Bearer <token>
```

### Hard Delete Tag
```http
DELETE /api/v1/tags/:id/hard
Authorization: Bearer <token>
```

---

## 📎 Attachments

### Upload Attachment
```http
POST /api/v1/attachments
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary>
```

**Required Permission:** `create:Attachment`

### Get Attachment Statistics
```http
GET /api/v1/attachments/stats
Authorization: Bearer <token>
```

### Get Attachment by ID
```http
GET /api/v1/attachments/:id
Authorization: Bearer <token>
```

### Get Attachments by User
```http
GET /api/v1/attachments/user/:userId
Authorization: Bearer <token>
```

### Update Attachment
```http
PATCH /api/v1/attachments/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "filename": "new-name.jpg",
  "alt": "Alt text"
}
```

**Required Permission:** `update:Attachment`

### Delete Attachment (Soft Delete)
```http
DELETE /api/v1/attachments/:id
Authorization: Bearer <token>
```

**Required Permission:** `delete:Attachment`

### Hard Delete Attachment
```http
DELETE /api/v1/attachments/:id/hard
Authorization: Bearer <token>
```

**Required Permission:** `manage:all` (Super Admin only)

### Restore Attachment
```http
POST /api/v1/attachments/:id/restore
Authorization: Bearer <token>
```

**Required Permission:** `restore:Attachment`

### Get Presigned URL
```http
POST /api/v1/attachments/:id/presigned-url
Authorization: Bearer <token>
Content-Type: application/json

{
  "expiresIn": 3600
}
```

### Download Attachment
```http
GET /api/v1/attachments/:id/download
Authorization: Bearer <token>
```

### Cleanup Orphaned Attachments
```http
POST /api/v1/attachments/cleanup-orphaned
Authorization: Bearer <token>
```

---

## 🌍 Countries

### List Countries
```http
GET /api/v1/countries
Authorization: Bearer <token>
```

---

## ⚕️ Health Checks

### Health Check
```http
GET /api/health
```

### Readiness Check
```http
GET /api/health/ready
```

### Liveness Check
```http
GET /api/health/live
```

---

## 🔧 Admin

### Get Cleanup Statistics
```http
GET /api/v1/admin/cleanup/stats
Authorization: Bearer <token>
```

### Trigger Manual Cleanup
```http
POST /api/v1/admin/cleanup/trigger
Authorization: Bearer <token>
```

---

## 🎯 Permission Requirements

### Actions
- `manage` - Full control (super permission)
- `create` - Create new resources
- `read` - View resources
- `update` - Modify existing resources
- `delete` - Remove resources (soft delete)
- `restore` - Restore soft-deleted resources
- `export` - Export data
- `import` - Import data
- `publish` - Publish content
- `archive` - Archive resources
- `moderate` - Moderate content
- `assign` - Assign resources/roles

### Subjects
- `all` - All subjects (wildcard for super-admin)
- `User` - User accounts
- `Story` - Story content
- `Attachment` - File uploads
- `Category` - Content categories
- `Tag` - Content tags
- `Session` - User sessions
- `Role` - User roles
- `Permission` - Permissions
- `Country` - Country data
- `Setting` - System settings

### Default Roles

#### Super Admin
- Has `manage:all` permission
- **Bypasses ALL permission checks** (no DB queries)
- Instant access to all endpoints

#### Admin
- Full CRUD on most resources
- Cannot manage roles/permissions (except super-admin)

#### Moderator
- Read users
- CRUD + Moderate + Publish stories
- Read categories, tags, settings

#### User
- Update own profile
- CRUD own stories/attachments
- Read public resources

#### Guest
- Read-only access to public resources

---

## 📝 Response Format

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "data": { ... },
  "message": "Optional success message"
}
```

### Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "path": "/api/v1/stories",
  "timestamp": "2025-10-25T00:00:00.000Z",
  "error": {
    "message": "Error description",
    "error": "Bad Request",
    "statusCode": 400
  }
}
```

### Validation Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "error": {
    "message": ["name should not be empty", "email must be an email"],
    "error": "Bad Request",
    "statusCode": 400
  }
}
```

---

## 🔗 Related Documentation

- [ACL Quick Reference](./features/acl/QUICK_REFERENCE.md)
- [Super Admin Access](./SUPER_ADMIN_ACCESS.md)
- [ACL Full Documentation](./features/acl/README.md)
- [Swagger UI](http://localhost:4040/api/docs)
