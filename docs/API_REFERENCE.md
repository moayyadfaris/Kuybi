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
    "refreshToken": "<session id>.<secret>",
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
  "refreshToken": "<session id>.<secret>"
}
```

### Logout

```http
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

`refreshToken` is `<session id>.<secret>`, not a JWT. Refreshing rotates it: the old one stops
working, and of two concurrent refreshes with the same token only one succeeds.

### Sign-up, email verification and password reset

```http
POST /api/v1/auth/register              { email, password, firstName, lastName, phoneNumber? }
POST /api/v1/auth/verify-email          { token }
POST /api/v1/auth/resend-verification   { email }
POST /api/v1/auth/forgot-password       { email }
POST /api/v1/auth/validate-reset-token  { token }
POST /api/v1/auth/reset-password        { token, newPassword }
```

- Emails link to **frontend pages**, which post the token to the API:
  `<app.url>/verify-email?token=…` → `POST /verify-email`, and
  `<app.url>/reset-password?token=…` → `POST /reset-password`.
- Links are single use; verification links last 24 hours, reset links 1 hour. Only a hash
  of each token is stored.
- `forgot-password` and `resend-verification` answer the same whether or not the email is
  registered, so they cannot be used to find accounts.
- New passwords must pass the strength check (`POST /password-strength`), may not be one
  of the last five, and are at most 72 bytes. A reset or a password change ends the other
  sessions and always emails the account owner.

---

## 👥 Session Management

### List Sessions

```http
GET /api/v1/sessions          (also /api/v1/sessions/me)
Authorization: Bearer <token>
```

The one session list (`GET /api/v1/auth/sessions` was merged into it). Each session carries
`status`: `active`, `expired` or `revoked`. Query: `page` (from 1), `limit` (1-100),
`filterByStatus` (`active`, `expiring` = within 24 hours, `expired`, `revoked`, `all`; default:
live sessions, or all with `includeExpired=true`), `filterByDevice`, `filterByType`,
`filterBySecurityLevel`, `searchByIp`, `searchByFingerprint`, `sortBy`, `sortOrder`,
`includeRiskAssessment`, `anonymizeData` (masks the end of each IP address).

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
POST /api/v1/sessions/:id/extend?days=7
Authorization: Bearer <token>
```

`days`: 1-30. The new expiry is never more than 30 days from now.

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

All story routes need a signed-in user. Which stories a user sees comes from their role's
`read:Story` rules (ADR 0010): the `user` role reads published stories and its own.

**Access rules**

- A story the caller may not read answers `404`, on reads and on changes alike; a story they
  may read but not change answers `403`.
- Editor-only fields (`internalNotes`, `deletionReason`, `deletedBy`, `updatedBy`,
  `lastModifiedBy`, and the exact location `latitude`, `longitude`, `address`) are returned
  only to callers who may update the story. `city`, `region` and `countryId` stay visible.
- Page sizes (`limit`) are 1 to 100. Path enums and ids are validated (`400` otherwise).
- `countryId` must be an existing, active country (`400` otherwise).

### Create Story

```http
POST /api/v1/stories
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "My Story",
  "details": "Story content...",
  "type": "STORY",
  "priority": "NORMAL",
  "status": "DRAFT",
  "categoryIds": ["<uuid>"],
  "tagIds": [1],
  "tags": ["new-tag-name"]
}
```

**Required Permission:** `create:Story`. Authors may create `DRAFT` or `PENDING_REVIEW`;
other statuses need `publish:Story`.

### List and Read

```http
GET /api/v1/stories?search=&status=&type=&userId=&priority=&countryId=&parentId=&categoryIds=a,b&fromDate=&toDate=&includeDeleted=&page=1&limit=20&sortBy=createdAt&sortOrder=DESC
GET /api/v1/stories/stats
GET /api/v1/stories/user/:userId?page=&limit=&includeDeleted=
GET /api/v1/stories/status/:status?page=&limit=
GET /api/v1/stories/type/:type?page=&limit=
GET /api/v1/stories/:id/children?includeDeleted=
GET /api/v1/stories/:id
```

**Required Permission:** `read:Story`. `search` matches title and details literally (`%`
and `_` are not wildcards). `includeDeleted` only has an effect for callers who read every
story.

### Update Story

```http
PATCH /api/v1/stories/:id
Content-Type: application/json

{ "title": "Updated title", "details": "Updated content" }
```

**Required Permission:** `update:Story` on this story. A non-empty `categoryIds`/`tagIds`/
`tags` replaces the current set. `parentId` may not be the story itself or one of its
replies. Each update records an automatic version.

### Update Story Status

```http
PATCH /api/v1/stories/:id/status
Content-Type: application/json

{ "status": "PUBLISHED" }
```

**Required Permission:** `publish:Story`. A published story cannot go back to `DRAFT`;
`DELETED` is set only by `DELETE /stories/:id`.

### Delete, Restore, Hard Delete

```http
DELETE /api/v1/stories/:id?reason=<up to 255 chars>   # soft delete, 204
POST   /api/v1/stories/:id/restore                     # back to DRAFT
DELETE /api/v1/stories/:id/hard                        # super-admin only, 204
```

**Required Permission:** `delete:Story`, `restore:Story`, `manage:all`.

### Tags, Categories, Attachments

```http
POST   /api/v1/stories/:id/tags          { "tagIds": [1], "tags": ["name"] }
DELETE /api/v1/stories/:id/tags          { "tagIds": [1], "tags": ["name"] }
POST   /api/v1/stories/:id/categories    { "categoryIds": ["<uuid>"] }
DELETE /api/v1/stories/:id/categories    { "categoryIds": ["<uuid>"] }
POST   /api/v1/stories/:id/attachments   { "attachmentIds": ["<uuid>"] }
DELETE /api/v1/stories/:id/attachments   { "attachmentIds": ["<uuid>"] }
GET    /api/v1/stories/:id/tags | categories | attachments
```

Changes need `update:Story` on the story and return the whole story. Missing tag names are
created; deleted categories are refused. Attachments must be the caller's own or public.

### Main Image

```http
PUT    /api/v1/stories/:id/main-image    { "attachmentId": "<uuid>" }
DELETE /api/v1/stories/:id/main-image
```

The image must be one of the caller's own images; it is made public when set.

### Versions

```http
GET  /api/v1/stories/:id/versions?limit=&offset=&branchName=
GET  /api/v1/stories/:id/versions/:versionNumber
POST /api/v1/stories/:id/versions                    { "commitMessage": "...", "branchName": "main" }
POST /api/v1/stories/:id/versions/rollback           { "versionNumber": 3, "commitMessage": "...", "createBranch": false }
POST /api/v1/stories/:id/versions/branch             { "branchName": "draft-2", "fromVersionNumber": 3 }
POST /api/v1/stories/:id/versions/merge              { "fromBranch": "draft-2", "fromVersionNumber": 5, "targetBranch": "main", "commitMessage": "..." }
POST /api/v1/stories/:id/versions/compare            { "versionA": 3, "versionB": 5 }
GET  /api/v1/stories/:id/versions/branches/info
POST /api/v1/stories/:id/versions/:versionNumber/tag { "tag": "release-1" }
```

Every version route, reads included, needs `update:Story` on the story: old versions keep
removed content and staff notes. A rollback on `main` restores the content of that version
(not its status, links or main image) and records one `ROLLBACK` version; with
`createBranch` it only records the version on a new branch. A merge with conflicting
changes answers `409` with the conflicts; resend with `resolveConflicts`.

Retention: a daily job keeps the newest `STORY_KEEP_AUTO_VERSIONS` (default 50) automatic
versions per story and branch. Manual, branch, merge and rollback versions, tagged and
pinned versions, fork points and merge or rollback sources are always kept.

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

The slug is derived from the name (with a numeric suffix if taken) unless one is sent. Slugs
are unique among live categories: a deleted category's slug can be used again. A taken
explicit slug answers `409`.

### List Categories

```http
GET /api/v1/categories?search=&isActive=&includeCounts=&includeDeleted=&orderBy=name&orderDirection=ASC&page=1&limit=50
Authorization: Bearer <token>
```

`search` matches name, slug and description literally (`%` and `_` are not wildcards).
`includeCounts` adds `storyCount` (live stories). `includeDeleted` applies only for callers
with `restore:Category`; for others it is ignored.

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

Renaming keeps the slug (it is in public URLs); send `slug` to change it (`409` if taken).

### Delete Category (Soft Delete)

```http
DELETE /api/v1/categories/:id
Authorization: Bearer <token>
```

**Required Permission:** `delete:Category`

The category disappears from stories (their links are kept, so a restore brings it back).

### Restore Category

```http
POST /api/v1/categories/:id/restore
Authorization: Bearer <token>
```

**Required Permission:** `restore:Category`

Restores the category with its active flag as it was. `404` if the category is not deleted,
`409` if a live category now uses its slug.

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

**Required Permission:** `create:Tag`. Names are stored trimmed and lowercase and are unique
among live tags (`409` otherwise; a deleted tag's name can be used again). System tags
(`isSystem: true`) are created, changed and deleted by super-admins only (`403` for others).

### List Tags

```http
GET /api/v1/tags?search=&sortBy=sortOrder&sortOrder=ASC&limit=100&offset=0
```

Public. `search` matches names starting with it; `limit` is 1–500 (default 100). Tags are
returned without who created or changed them.

### List System Tags

```http
GET /api/v1/tags/system
```

### Get Tag by ID

```http
GET /api/v1/tags/:id
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

The tag disappears from stories and can no longer be attached; its name becomes free.

### Hard Delete Tag

```http
DELETE /api/v1/tags/:id/hard
Authorization: Bearer <token>
```

---

## 📎 Attachments

Uploads are public by default; the uploader can ask for private (ADR 0009). Users read
their own files and public ones; someone else's private file, and any soft-deleted file,
answers `404`. Ids must be UUIDs (`400` otherwise).

**Response shape** (`AttachmentResponseDto`): id, owner id, name, type, size, category,
description, tags, folder, visibility, status, counters, timestamps, a `metadata` subset
(`width`, `height`, `format`, `hasLocation`, `processingStatus`, `rejectionReasons`),
`downloadUrl` (`/api/v1/attachments/:id/download`), and for public files only `url`,
`originalImageUrl`, `previewUrl`, `placeholderUrl` and thumbnail URLs. Storage keys, the
encryption key, scan results and the uploader's account are never returned.

### Upload

```http
POST /api/v1/attachments            # multipart: file, category, description, tags, isPublic, generateThumbnails, allowDuplicates, async
POST /api/v1/attachments/bulk       # multipart: files (up to 10), same fields
POST /api/v1/attachments/uploads    # direct upload: returns a presigned POST
POST /api/v1/attachments/uploads/:id/complete
```

**Required Permission:** `create:Attachment`. Images are stripped of EXIF (GPS, camera)
and optimized before they are stored: in the request, or in the worker with `async`
(default: `ATTACHMENT_ASYNC_PROCESSING`). A finished upload has `securityStatus`
`completed`.

Multipart uploads are held in memory, so they must declare their size (`Content-Length`,
`411` otherwise) and may not exceed 100 MB in total (`413`). While an API process already
holds `ATTACHMENT_MAX_IN_FLIGHT_MB` (300) of uploads it answers `503` with `Retry-After`.
Large files belong in direct uploads, which go straight to storage.

### Read

```http
GET /api/v1/attachments?category=&mimeType=image/&isPublic=&securityStatus=completed&minSize=&maxSize=&startDate=&endDate=&includeDeleted=&page=1&limit=20&sortBy=createdAt&sortOrder=DESC
GET /api/v1/attachments/user/:userId?page=&limit=   # your own, or anyone's for readers of all files
GET /api/v1/attachments/:id
GET /api/v1/attachments/:id/download
POST /api/v1/attachments/:id/presigned-url          { "expiresIn": 3600, "downloadFilename": "report.pdf" }
GET /api/v1/attachments/stats                       # manage:all
```

`includeDeleted` only has an effect for callers who may read every file.

### Change

```http
PATCH  /api/v1/attachments/:id          { "description": "...", "tags": ["a"], "folder": "x", "category": "y", "isPublic": false }
DELETE /api/v1/attachments/:id          # soft delete
POST   /api/v1/attachments/:id/restore  # restore:Attachment
DELETE /api/v1/attachments/:id/hard     # manage:all; deletes every stored object
```

`isPublic` changes the stored objects' access too. `metadata` cannot be written.

---

## 🧩 Post Types and Content

Dynamic content types with custom fields (values in a JSONB `field_data`).

```http
GET    /api/v1/post-types?includeInactive=        # public; inactive types only for update:PostType
GET    /api/v1/post-types/:id | /slug/:slug
POST   /api/v1/post-types                          # create:PostType; slug generated from the name
PATCH  /api/v1/post-types/:id                      # update:PostType; system types are read-only
DELETE /api/v1/post-types/:id                      # delete:PostType; 409 while it has entries

GET    /api/v1/post-types/:postTypeId/fields       # public
POST   /api/v1/post-types/:postTypeId/fields       # create:FieldDefinition; snake_case name
PATCH  /api/v1/post-types/:postTypeId/fields/:id
POST   /api/v1/post-types/:postTypeId/fields/reorder
DELETE /api/v1/post-types/:postTypeId/fields/:id

GET    /api/v1/content/:postTypeSlug?status=&search=&limit=20&offset=0&includeDeleted=
GET    /api/v1/content/:postTypeSlug/:id | /slug/:slug
POST   /api/v1/content/:postTypeSlug               # create:Content  { title, excerpt, status, field_data, scheduledFor }
PATCH  /api/v1/content/:postTypeSlug/:id           # update:Content; field_data is merged
POST   /api/v1/content/:postTypeSlug/:id/publish   # publish:Content
POST   /api/v1/content/:postTypeSlug/:id/schedule  # publish:Content  { scheduledFor }
DELETE /api/v1/content/:postTypeSlug/:id           # delete:Content (soft)
```

- Public readers (no token, or no `update:Content`) see published entries of active post
  types only; `status` and `includeDeleted` filters are for editors. Lists return the
  total matching count.
- Setting `published` or `scheduled` (on create, update or schedule) needs
  `publish:Content`; `deleted` is set only by DELETE. Scheduled entries are published by
  the worker within a minute of their time.
- `PATCH` merges `field_data` into the stored values; values of fields removed from the
  post type are dropped. File, image and video values must be http(s) URLs.
- A field marked `isUnique` takes each value once among the live entries of its post type:
  a repeat answers `409` (with the conflicting `fields`), concurrent writers included.
  Marking a field unique while entries share a value also answers `409`.
- Names of post types and fields, and entry slugs, can be reused after a delete.
- Entries show their author's id and name only.

---

## 🌐 Public Web API

Unauthenticated, read-only and rate limited (100 requests per 15 minutes per client).

```http
GET /api/web/v1/stories?search=&categorySlug=&tag=&page=1&limit=20
GET /api/web/v1/stories/:id
GET /api/web/v1/categories?search=&page=1&limit=20
GET /api/web/v1/categories/tree        # every active category (flat)
GET /api/web/v1/categories/slug/:slug
GET /api/web/v1/categories/:id
```

Only published stories and active categories are returned, in an allowlisted shape. A
story's `mainImage` is `{ id, mimeType, width, height, url, previewUrl, placeholderUrl,
thumbnails }`, given only for a public, live image the security scan cleared (`null`
otherwise). `metadata.featuredImageUrl` is returned only when it is an http(s) link.
Filters are capped at 200 characters (`categorySlug` 140).

## 🌍 Countries

### List Countries

```http
GET /api/v1/countries?search=&continent=&isActive=&fields=iso,name&orderBy=name&orderDirection=asc&page=0&limit=50
```

Public. `page` is 0-based; `limit` is 1–500. `search` (up to 100 characters) matches name,
nicename, iso or iso3 literally (`%` and `_` are not wildcards). `fields` returns only the
listed fields.

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
  "statusCode": 401,
  "path": "/api/v1/stories",
  "timestamp": "2026-10-20T00:00:00.000Z",
  "requestId": "3f2c…",
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "Access token expired"
  }
}
```

**Branch on `error.code`, never on `error.message`**: messages are for people and may
change; codes are stable (new ones are added, existing ones never change meaning). The full
list, with what the client should do, is `ErrorCode` in `src/shared/errors/error-code.ts`.
The ones clients usually handle:

| Code                                                                                           | Status   | Client action                                         |
| ---------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| `AUTH_TOKEN_EXPIRED`                                                                           | 401      | Refresh the access token, retry                       |
| `AUTH_TOKEN_MISSING`, `AUTH_TOKEN_INVALID`, `AUTH_SESSION_ENDED`, `AUTH_REFRESH_TOKEN_INVALID` | 401      | Sign in again (a refresh will not help)               |
| `AUTH_INVALID_CREDENTIALS`                                                                     | 401      | Show "wrong email or password"                        |
| `AUTH_ACCOUNT_LOCKED`                                                                          | 423      | Show the lock; `error.details.unlockIn` is in seconds |
| `AUTH_ACCOUNT_INACTIVE`                                                                        | 401      | Account disabled                                      |
| `AUTH_PASSWORD_CHANGE_REQUIRED`                                                                | 403      | Send the user to change their password                |
| `PASSWORD_CHANGE_COOLDOWN`                                                                     | 429      | Password changed recently; see `error.details`        |
| `VALIDATION_FAILED`                                                                            | 400      | `error.message` is the list of problems               |
| `IDEMPOTENCY_KEY_REUSED`                                                                       | 422      | Same key, different request: use a new key            |
| `IDEMPOTENCY_IN_PROGRESS`                                                                      | 409      | The first request is still running: retry later       |
| `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `TOO_MANY_REQUESTS`, …                                   | as named | Generic code of the status                            |
| `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`                                                        | 5xx      | Retry later; quote `requestId` when reporting         |

### Validation Error Response

```json
{
  "success": false,
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": ["name should not be empty", "email must be an email"],
    "error": "Bad Request"
  }
}
```

---

## 🔗 Related Documentation

- [ACL Quick Reference](./features/acl/QUICK_REFERENCE.md)
- [Super Admin Access](./SUPER_ADMIN_ACCESS.md)
- [ACL Full Documentation](./features/acl/README.md)
- [Swagger UI](http://localhost:4040/api/docs)
