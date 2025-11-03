# Story Publishing API Documentation

## Overview
The Story Publishing API allows you to manage story lifecycle through status transitions, including publishing, archiving, and other workflow states.

---

## Publish/Update Story Status

**Endpoint:** `PATCH /api/v1/stories/:id/status`

**Description:** Update the status of a story (publish, archive, etc.). This endpoint enforces status transition rules to maintain data integrity.

**URL Parameters:**
- `id` (number, required) - Story ID

**Authentication:**
- Requires JWT Bearer token
- Requires **Publish** permission on Story resource

**Request Headers:**
```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

---

## Story Status Values

| Status | Description | Use Case |
|--------|-------------|----------|
| `DRAFT` | Initial draft state | Story being created/edited |
| `PENDING_REVIEW` | Submitted for review | Awaiting editorial review |
| `IN_REVIEW` | Currently under review | Being reviewed by editors |
| `APPROVED` | Review approved | Ready to publish |
| `REJECTED` | Review rejected | Needs revisions |
| `PUBLISHED` | Live/published | Visible to public |
| `ARCHIVED` | Archived | Hidden but preserved |
| `DELETED` | Soft deleted | Marked for deletion |
| `SUSPENDED` | Temporarily suspended | Content violation/moderation |
| `FLAGGED` | Flagged for review | Reported content |
| `UNDER_INVESTIGATION` | Being investigated | Compliance/moderation check |

---

## Status Transition Rules

### ✅ Allowed Transitions

```
DRAFT → PENDING_REVIEW → IN_REVIEW → APPROVED → PUBLISHED
                                   ↓
                              REJECTED → DRAFT

PUBLISHED → ARCHIVED
PUBLISHED → SUSPENDED
PUBLISHED → FLAGGED → UNDER_INVESTIGATION

DELETED → DRAFT (restore only)
```

### ❌ Forbidden Transitions

- **PUBLISHED → DRAFT** - Cannot unpublish directly to draft
- **DELETED → (any except DRAFT)** - Deleted stories can only be restored to draft

---

## Request Body

```json
{
  "status": "PUBLISHED"
}
```

**Fields:**
- `status` (string, required) - New status from `StoryStatus` enum

---

## Examples

### 1. Publish a Story

**Request:**
```bash
PATCH /api/v1/stories/123/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "PUBLISHED"
}
```

**Success Response (200 OK):**
```json
{
  "id": 123,
  "title": "My Amazing Story",
  "slug": "my-amazing-story",
  "subtitle": "A fascinating tale",
  "content": "Story content here...",
  "excerpt": "Brief excerpt...",
  "status": "PUBLISHED",
  "type": "NEWS",
  "priority": "NORMAL",
  "readTime": 5,
  "views": 0,
  "likes": 0,
  "shares": 0,
  "isPublished": true,
  "isFeatured": false,
  "allowComments": true,
  "createdBy": "user-123",
  "lastModifiedBy": "user-123",
  "createdAt": "2024-11-01T10:00:00.000Z",
  "updatedAt": "2024-11-03T12:00:00.000Z",
  "publishedAt": "2024-11-03T12:00:00.000Z",
  "author": {
    "id": "user-123",
    "email": "author@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "categories": [
    {
      "id": 5,
      "name": "Technology",
      "slug": "technology"
    }
  ],
  "tags": [
    {
      "id": "tag-1",
      "name": "AI",
      "slug": "ai"
    }
  ]
}
```

---

### 2. Archive a Published Story

**Request:**
```bash
PATCH /api/v1/stories/123/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "ARCHIVED"
}
```

**Success Response (200 OK):**
```json
{
  "id": 123,
  "title": "My Amazing Story",
  "status": "ARCHIVED",
  "updatedAt": "2024-11-03T12:30:00.000Z",
  "archivedAt": "2024-11-03T12:30:00.000Z"
}
```

---

### 3. Submit Story for Review

**Request:**
```bash
PATCH /api/v1/stories/123/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "PENDING_REVIEW"
}
```

**Success Response (200 OK):**
```json
{
  "id": 123,
  "title": "My Amazing Story",
  "status": "PENDING_REVIEW",
  "updatedAt": "2024-11-03T11:00:00.000Z"
}
```

---

### 4. Approve Story (Editor Action)

**Request:**
```bash
PATCH /api/v1/stories/123/status
Authorization: Bearer <editor-token>
Content-Type: application/json

{
  "status": "APPROVED"
}
```

**Success Response (200 OK):**
```json
{
  "id": 123,
  "title": "My Amazing Story",
  "status": "APPROVED",
  "updatedAt": "2024-11-03T11:15:00.000Z"
}
```

---

### 5. Flag Story for Moderation

**Request:**
```bash
PATCH /api/v1/stories/123/status
Authorization: Bearer <moderator-token>
Content-Type: application/json

{
  "status": "FLAGGED"
}
```

**Success Response (200 OK):**
```json
{
  "id": 123,
  "title": "My Amazing Story",
  "status": "FLAGGED",
  "updatedAt": "2024-11-03T13:00:00.000Z"
}
```

---

### 6. Restore Deleted Story

**Request:**
```bash
PATCH /api/v1/stories/123/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "DRAFT"
}
```

**Success Response (200 OK):**
```json
{
  "id": 123,
  "title": "My Amazing Story",
  "status": "DRAFT",
  "updatedAt": "2024-11-03T14:00:00.000Z"
}
```

---

## Error Responses

### 400 Bad Request - Invalid Status Transition

**Example:** Trying to unpublish directly to draft
```json
{
  "statusCode": 400,
  "message": "Cannot revert published story to draft",
  "error": "Bad Request"
}
```

**Example:** Invalid status for deleted story
```json
{
  "statusCode": 400,
  "message": "Deleted stories can only be restored to draft status",
  "error": "Bad Request"
}
```

### 401 Unauthorized

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 403 Forbidden - Insufficient Permissions

```json
{
  "statusCode": 403,
  "message": "Forbidden resource - requires publish permission",
  "error": "Forbidden"
}
```

### 404 Not Found

```json
{
  "statusCode": 404,
  "message": "Story with ID 123 not found",
  "error": "Not Found"
}
```

---

## Publishing Workflow Examples

### Complete Editorial Workflow

```javascript
// 1. Create draft story
const createResponse = await fetch('/api/v1/stories', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authorToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Breaking News Story',
    content: 'Story content...',
    status: 'DRAFT'
  })
});
const story = await createResponse.json();

// 2. Author submits for review
await fetch(`/api/v1/stories/${story.id}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${authorToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'PENDING_REVIEW' })
});

// 3. Editor starts review
await fetch(`/api/v1/stories/${story.id}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${editorToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'IN_REVIEW' })
});

// 4. Editor approves
await fetch(`/api/v1/stories/${story.id}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${editorToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'APPROVED' })
});

// 5. Publisher publishes
await fetch(`/api/v1/stories/${story.id}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${publisherToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'PUBLISHED' })
});
```

### Quick Publish (Admin/Publisher Direct)

```javascript
// Admin can publish directly from draft
const publishResponse = await fetch(`/api/v1/stories/${storyId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'PUBLISHED' })
});
```

### Archive Published Story

```javascript
const archiveResponse = await fetch(`/api/v1/stories/${storyId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'ARCHIVED' })
});
```

### Content Moderation Flow

```javascript
// 1. Flag story for review
await fetch(`/api/v1/stories/${storyId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${moderatorToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'FLAGGED' })
});

// 2. Start investigation
await fetch(`/api/v1/stories/${storyId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${moderatorToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'UNDER_INVESTIGATION' })
});

// 3. Suspend if needed
await fetch(`/api/v1/stories/${storyId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${moderatorToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'SUSPENDED' })
});
```

---

## TypeScript Types

```typescript
export enum StoryStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
  SUSPENDED = 'SUSPENDED',
  FLAGGED = 'FLAGGED',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION'
}

export interface UpdateStoryStatusRequest {
  status: StoryStatus;
}

export interface StoryResponse {
  id: number;
  title: string;
  slug: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  status: StoryStatus;
  type: string;
  priority: string;
  readTime?: number;
  views: number;
  likes: number;
  shares: number;
  isPublished: boolean;
  isFeatured: boolean;
  allowComments: boolean;
  createdBy: string;
  lastModifiedBy: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  archivedAt?: Date;
  author?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  categories?: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  tags?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}
```

---

## State Machine Diagram

```
┌─────────┐
│  DRAFT  │◄──────────────────────┐
└────┬────┘                       │
     │                             │
     ▼                             │
┌──────────────┐            ┌──────────┐
│PENDING_REVIEW│            │ REJECTED │
└──────┬───────┘            └─────▲────┘
       │                          │
       ▼                          │
┌───────────┐                     │
│ IN_REVIEW ├─────────────────────┘
└─────┬─────┘
      │
      ▼
┌──────────┐
│ APPROVED │
└────┬─────┘
     │
     ▼
┌───────────┐       ┌──────────┐
│ PUBLISHED ├──────►│ ARCHIVED │
└─────┬─────┘       └──────────┘
      │
      ├──────────►┌────────────┐
      │           │ SUSPENDED  │
      │           └────────────┘
      │
      └──────────►┌─────────┐      ┌────────────────────┐
                  │ FLAGGED ├─────►│UNDER_INVESTIGATION │
                  └─────────┘      └────────────────────┘
```

---

## Permission Requirements

| Status Transition | Required Permission | Typical Role |
|-------------------|-------------------|--------------|
| DRAFT → PENDING_REVIEW | Author | Writer, Contributor |
| PENDING_REVIEW → IN_REVIEW | Publish | Editor |
| IN_REVIEW → APPROVED | Publish | Editor |
| IN_REVIEW → REJECTED | Publish | Editor |
| APPROVED → PUBLISHED | Publish | Publisher, Admin |
| PUBLISHED → ARCHIVED | Publish | Publisher, Admin |
| PUBLISHED → FLAGGED | Publish | Moderator, Admin |
| FLAGGED → UNDER_INVESTIGATION | Publish | Moderator, Admin |
| * → SUSPENDED | Publish | Admin |
| DELETED → DRAFT | Publish | Admin |

---

## Best Practices

### 1. Always Check Current Status
Before attempting a status change, fetch the current story to verify its current state:
```javascript
const story = await fetch(`/api/v1/stories/${storyId}`);
console.log('Current status:', story.status);
```

### 2. Handle Transition Errors Gracefully
```javascript
try {
  await updateStatus(storyId, 'PUBLISHED');
} catch (error) {
  if (error.status === 400) {
    // Invalid transition - show user allowed options
    showAllowedTransitions(currentStatus);
  }
}
```

### 3. Show Status History
Consider implementing a status history log to track all transitions for audit purposes.

### 4. Implement UI Validation
Only show status options that are valid transitions from the current state.

### 5. Use Optimistic Updates
Update UI immediately, then revert if API call fails:
```javascript
// Optimistic update
setStoryStatus('PUBLISHED');

try {
  await updateStatus(storyId, 'PUBLISHED');
} catch (error) {
  // Revert on error
  setStoryStatus(originalStatus);
  showError(error.message);
}
```

### 6. Notify Stakeholders
When status changes (especially to PENDING_REVIEW or REJECTED), notify relevant users:
- Author when story is approved/rejected
- Editors when new submissions arrive
- Moderators when content is flagged

---

## Related APIs

- **GET /api/v1/stories/:id** - Get story details including current status
- **PATCH /api/v1/stories/:id** - Update story content (separate from status)
- **GET /api/v1/stories** - List stories with status filtering
- **POST /api/v1/stories** - Create new story with initial status

---

## Common Questions

### Q: Can I unpublish a story?
**A:** You cannot directly change PUBLISHED → DRAFT. Instead, use PUBLISHED → ARCHIVED to hide the story while preserving its published state.

### Q: How do I soft delete a story?
**A:** Update status to `DELETED`. The story will be marked for deletion but not physically removed from the database.

### Q: Can I skip the review process?
**A:** Users with admin/publisher permissions can publish directly from DRAFT to PUBLISHED, bypassing the review workflow.

### Q: What happens when a story is SUSPENDED?
**A:** The story becomes immediately unavailable to public viewers but remains in the system for administrative review.

### Q: How do I restore an archived story?
**A:** There's no direct ARCHIVED → PUBLISHED transition. You'll need to implement a separate restoration workflow or manually change the status through an admin interface.

---

## Support

For questions or issues with the Publishing API, please contact the backend team or refer to the complete API documentation at `/api/docs`.
