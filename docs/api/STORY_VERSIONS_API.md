# Story Versions API Documentation

## Base URL
```
/api/v1/stories/:storyId/versions
```

## Authentication
All endpoints require JWT Bearer token authentication.

**Header:**
```
Authorization: Bearer <your-jwt-token>
```

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/stories/:storyId/versions` | Get version history |
| GET | `/api/v1/stories/:storyId/versions/:versionNumber` | Get specific version |
| POST | `/api/v1/stories/:storyId/versions` | Create manual version |
| POST | `/api/v1/stories/:storyId/versions/rollback` | Rollback to previous version |
| POST | `/api/v1/stories/:storyId/versions/branch` | Create new branch |
| POST | `/api/v1/stories/:storyId/versions/merge` | Merge branches |
| POST | `/api/v1/stories/:storyId/versions/compare` | Compare two versions |
| GET | `/api/v1/stories/:storyId/versions/branches/info` | Get branch information |
| POST | `/api/v1/stories/:storyId/versions/:versionNumber/tag` | Tag a version |

---

## 1. Get Version History

**Endpoint:** `GET /api/v1/stories/:storyId/versions`

**Description:** Retrieve paginated version history for a story with optional branch filtering.

**URL Parameters:**
- `storyId` (number, required) - Story ID

**Query Parameters:**
- `limit` (number, optional) - Items per page (max 100, default: 20)
- `offset` (number, optional) - Offset for pagination (default: 0)
- `branchName` (string, optional) - Filter by branch name (e.g., "main", "feature-1")

**Example Request:**
```bash
GET /api/v1/stories/123/versions?limit=10&offset=0&branchName=main
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "storyId": 123,
    "versionNumber": 5,
    "versionLabel": "v1.0",
    "versionType": "MANUAL",
    "status": "ACTIVE",
    "branchName": "main",
    "tag": "release-2024-11",
    "changesCount": 3,
    "changeSummary": "Updated title and content",
    "createdBy": {
      "id": "user-123",
      "email": "john@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "createdAt": "2024-11-03T10:30:00.000Z",
    "commitMessage": "Feature update",
    "isPinned": false,
    "expiresAt": null
  }
]
```

**Version Types:**
- `AUTO` - Automatically created on story update
- `MANUAL` - Manually created snapshot
- `ROLLBACK` - Created during rollback operation
- `BRANCH` - Branch creation version
- `MERGE` - Merge operation version

**Version Status:**
- `ACTIVE` - Current active version
- `ARCHIVED` - Archived version
- `DRAFT` - Draft version

---

## 2. Get Specific Version

**Endpoint:** `GET /api/v1/stories/:storyId/versions/:versionNumber`

**Description:** Retrieve details of a specific version by version number.

**URL Parameters:**
- `storyId` (number, required) - Story ID
- `versionNumber` (number, required) - Version number

**Example Request:**
```bash
GET /api/v1/stories/123/versions/5
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "storyId": 123,
  "versionNumber": 5,
  "versionLabel": "v1.0",
  "versionType": "MANUAL",
  "status": "ACTIVE",
  "branchName": "main",
  "tag": "release-2024-11",
  "changesCount": 3,
  "changeSummary": "Updated title and content",
  "createdBy": {
    "id": "user-123",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "createdAt": "2024-11-03T10:30:00.000Z",
  "commitMessage": "Feature update",
  "isPinned": false,
  "expiresAt": null
}
```

**Error Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "message": "Version not found",
  "error": "Not Found"
}
```

---

## 3. Create Manual Version

**Endpoint:** `POST /api/v1/stories/:storyId/versions`

**Description:** Create a manual snapshot version of the current story state.

**URL Parameters:**
- `storyId` (number, required) - Story ID

**Request Body:**
```json
{
  "versionLabel": "v1.0",
  "versionType": "MANUAL",
  "branchName": "main",
  "tag": "release-2024-11",
  "commitMessage": "Manual snapshot before major changes",
  "isPinned": false
}
```

**Request Body Fields:**
- `versionLabel` (string, optional) - Optional version label (e.g., v1.0, beta-1)
- `versionType` (enum, required) - Type of version (default: "MANUAL")
  - Values: `AUTO`, `MANUAL`, `ROLLBACK`, `BRANCH`, `MERGE`
- `branchName` (string, optional) - Branch name (default: "main")
- `tag` (string, optional) - Optional tag (e.g., release-2024-11)
- `commitMessage` (string, optional) - Commit message describing the changes
- `isPinned` (boolean, optional) - Pin this version to prevent auto-cleanup (default: false)

**Example Request:**
```bash
POST /api/v1/stories/123/versions
Authorization: Bearer <token>
Content-Type: application/json

{
  "versionLabel": "v1.0",
  "versionType": "MANUAL",
  "commitMessage": "Pre-release snapshot",
  "isPinned": true
}
```

**Success Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "storyId": 123,
  "versionNumber": 6,
  "versionLabel": "v1.0",
  "versionType": "MANUAL",
  "status": "ACTIVE",
  "branchName": "main",
  "tag": null,
  "changesCount": 0,
  "changeSummary": "Manual snapshot",
  "createdBy": {
    "id": "user-123",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "createdAt": "2024-11-03T11:00:00.000Z",
  "commitMessage": "Pre-release snapshot",
  "isPinned": true,
  "expiresAt": null
}
```

---

## 4. Rollback to Previous Version

**Endpoint:** `POST /api/v1/stories/:storyId/versions/rollback`

**Description:** Rollback story to a previous version, creating a new ROLLBACK version.

**URL Parameters:**
- `storyId` (number, required) - Story ID

**Request Body:**
```json
{
  "versionNumber": 5,
  "commitMessage": "Rollback to stable version",
  "createBranch": false,
  "branchName": "rollback-to-v5"
}
```

**Request Body Fields:**
- `versionNumber` (number, required) - Version number to rollback to
- `commitMessage` (string, required) - Commit message explaining the rollback
- `createBranch` (boolean, optional) - Create new branch for the rollback instead of affecting main branch (default: false)
- `branchName` (string, optional) - Branch name if createBranch is true

**Example Request:**
```bash
POST /api/v1/stories/123/versions/rollback
Authorization: Bearer <token>
Content-Type: application/json

{
  "versionNumber": 5,
  "commitMessage": "Rollback due to critical bug"
}
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "storyId": 123,
  "versionNumber": 7,
  "versionLabel": null,
  "versionType": "ROLLBACK",
  "status": "ACTIVE",
  "branchName": "main",
  "tag": null,
  "changesCount": 5,
  "changeSummary": "Reverted to version 5",
  "createdBy": {
    "id": "user-123",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "createdAt": "2024-11-03T11:15:00.000Z",
  "commitMessage": "Rollback due to critical bug",
  "isPinned": false,
  "expiresAt": null
}
```

**Error Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "message": "Version 5 not found for story 123",
  "error": "Not Found"
}
```

---

## 5. Create Branch

**Endpoint:** `POST /api/v1/stories/:storyId/versions/branch`

**Description:** Create a new branch from a specific version or latest.

**URL Parameters:**
- `storyId` (number, required) - Story ID

**Request Body:**
```json
{
  "branchName": "feature-improvements",
  "fromVersionNumber": 10,
  "commitMessage": "Starting new feature branch"
}
```

**Request Body Fields:**
- `branchName` (string, required) - Name of the new branch
- `fromVersionNumber` (number, optional) - Version number to branch from (defaults to latest version)
- `commitMessage` (string, optional) - Commit message for branch creation

**Example Request:**
```bash
POST /api/v1/stories/123/versions/branch
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchName": "feature-redesign",
  "fromVersionNumber": 5,
  "commitMessage": "Creating branch for redesign work"
}
```

**Success Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "storyId": 123,
  "versionNumber": 8,
  "versionLabel": null,
  "versionType": "BRANCH",
  "status": "ACTIVE",
  "branchName": "feature-redesign",
  "tag": null,
  "changesCount": 0,
  "changeSummary": "Branched from version 5",
  "createdBy": {
    "id": "user-123",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "createdAt": "2024-11-03T11:30:00.000Z",
  "commitMessage": "Creating branch for redesign work",
  "isPinned": false,
  "expiresAt": null
}
```

**Error Responses:**
- **404 Not Found:** Story or version not found
- **400 Bad Request:** Branch name already exists
```json
{
  "statusCode": 400,
  "message": "Branch 'feature-redesign' already exists",
  "error": "Bad Request"
}
```

---

## 6. Merge Branches

**Endpoint:** `POST /api/v1/stories/:storyId/versions/merge`

**Description:** Merge source branch into target branch with conflict detection.

**URL Parameters:**
- `storyId` (number, required) - Story ID

**Request Body:**
```json
{
  "fromBranch": "feature-improvements",
  "fromVersionNumber": 12,
  "targetBranch": "main",
  "commitMessage": "Merging feature improvements",
  "resolveConflicts": {
    "title": "Merged Title",
    "priority": "HIGH"
  }
}
```

**Request Body Fields:**
- `fromBranch` (string, required) - Source branch name
- `fromVersionNumber` (number, required) - Source version number to merge
- `targetBranch` (string, required) - Target branch name
- `commitMessage` (string, required) - Commit message for the merge
- `resolveConflicts` (object, optional) - Manual conflict resolution (field name → chosen value)

**Example Request:**
```bash
POST /api/v1/stories/123/versions/merge
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromBranch": "feature-redesign",
  "fromVersionNumber": 10,
  "targetBranch": "main",
  "commitMessage": "Merging redesign changes into main"
}
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "storyId": 123,
  "versionNumber": 9,
  "versionLabel": null,
  "versionType": "MERGE",
  "status": "ACTIVE",
  "branchName": "main",
  "tag": null,
  "changesCount": 7,
  "changeSummary": "Merged feature-redesign v10 into main",
  "createdBy": {
    "id": "user-123",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "createdAt": "2024-11-03T12:00:00.000Z",
  "commitMessage": "Merging redesign changes into main",
  "isPinned": false,
  "expiresAt": null
}
```

**Error Responses:**
- **404 Not Found:** Story or branch not found
- **409 Conflict:** Merge conflicts detected
```json
{
  "statusCode": 409,
  "message": "Merge conflicts detected in fields: title, priority",
  "error": "Conflict",
  "conflicts": {
    "title": {
      "source": "Feature Title",
      "target": "Main Title"
    },
    "priority": {
      "source": "HIGH",
      "target": "MEDIUM"
    }
  }
}
```

---

## 7. Compare Two Versions

**Endpoint:** `POST /api/v1/stories/:storyId/versions/compare`

**Description:** Compare two versions and return detailed diff.

**URL Parameters:**
- `storyId` (number, required) - Story ID

**Request Body:**
```json
{
  "versionA": 5,
  "versionB": 10
}
```

**Request Body Fields:**
- `versionA` (number, required) - First version number to compare
- `versionB` (number, required) - Second version number to compare

**Example Request:**
```bash
POST /api/v1/stories/123/versions/compare
Authorization: Bearer <token>
Content-Type: application/json

{
  "versionA": 5,
  "versionB": 8
}
```

**Success Response (200 OK):**
```json
{
  "versionA": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "storyId": 123,
    "versionNumber": 5,
    "versionLabel": "v1.0",
    "versionType": "MANUAL",
    "status": "ACTIVE",
    "branchName": "main",
    "tag": null,
    "changesCount": 3,
    "createdBy": {
      "id": "user-123",
      "email": "john@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "createdAt": "2024-11-03T10:00:00.000Z",
    "commitMessage": "Initial version",
    "isPinned": false
  },
  "versionB": {
    "id": "550e8400-e29b-41d4-a716-446655440003",
    "storyId": 123,
    "versionNumber": 8,
    "versionLabel": null,
    "versionType": "AUTO",
    "status": "ACTIVE",
    "branchName": "main",
    "tag": null,
    "changesCount": 2,
    "createdBy": {
      "id": "user-456",
      "email": "jane@example.com",
      "firstName": "Jane",
      "lastName": "Smith"
    },
    "createdAt": "2024-11-03T14:00:00.000Z",
    "commitMessage": "Updated content",
    "isPinned": false
  },
  "diff": {
    "modified": {
      "title": {
        "old": "Original Title",
        "new": "Updated Title"
      },
      "content": {
        "old": "Original content here...",
        "new": "Updated content here..."
      },
      "priority": {
        "old": "MEDIUM",
        "new": "HIGH"
      }
    },
    "added": {
      "subtitle": "New subtitle added"
    },
    "removed": {
      "oldField": "This field was removed"
    }
  },
  "changesCount": 5,
  "changedFields": ["title", "content", "priority", "subtitle", "oldField"]
}
```

**Diff Structure:**
- `modified` - Fields that changed (shows old and new values)
- `added` - Fields that were added in versionB
- `removed` - Fields that were removed from versionA

**Error Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "message": "Version not found",
  "error": "Not Found"
}
```

---

## 8. Get Branch Information

**Endpoint:** `GET /api/v1/stories/:storyId/versions/branches/info`

**Description:** Get statistics and information for all branches.

**URL Parameters:**
- `storyId` (number, required) - Story ID

**Example Request:**
```bash
GET /api/v1/stories/123/versions/branches/info
Authorization: Bearer <token>
```

**Success Response (200 OK):**
```json
[
  {
    "name": "main",
    "versionCount": 15,
    "latestVersion": 15,
    "lastUpdated": "2024-11-03T14:30:00.000Z",
    "isMain": true
  },
  {
    "name": "feature-redesign",
    "versionCount": 5,
    "latestVersion": 10,
    "lastUpdated": "2024-11-03T12:00:00.000Z",
    "isMain": false
  },
  {
    "name": "experimental",
    "versionCount": 3,
    "latestVersion": 8,
    "lastUpdated": "2024-11-02T16:00:00.000Z",
    "isMain": false
  }
]
```

**Response Fields:**
- `name` (string) - Branch name
- `versionCount` (number) - Number of versions in this branch
- `latestVersion` (number) - Latest version number on this branch
- `lastUpdated` (Date) - Latest version creation timestamp
- `isMain` (boolean) - Whether this is the main branch

---

## 9. Tag a Version

**Endpoint:** `POST /api/v1/stories/:storyId/versions/:versionNumber/tag`

**Description:** Add or update a tag on a specific version.

**URL Parameters:**
- `storyId` (number, required) - Story ID
- `versionNumber` (number, required) - Version number to tag

**Request Body:**
```json
{
  "tag": "release-2024-11"
}
```

**Request Body Fields:**
- `tag` (string, required) - Tag name

**Example Request:**
```bash
POST /api/v1/stories/123/versions/5/tag
Authorization: Bearer <token>
Content-Type: application/json

{
  "tag": "production-ready"
}
```

**Success Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "storyId": 123,
  "versionNumber": 5,
  "versionLabel": "v1.0",
  "versionType": "MANUAL",
  "status": "ACTIVE",
  "branchName": "main",
  "tag": "production-ready",
  "changesCount": 3,
  "changeSummary": "Updated title and content",
  "createdBy": {
    "id": "user-123",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "createdAt": "2024-11-03T10:30:00.000Z",
  "commitMessage": "Feature update",
  "isPinned": false,
  "expiresAt": null
}
```

**Error Responses:**
- **404 Not Found:** Version not found
- **400 Bad Request:** Tag name already exists
```json
{
  "statusCode": 400,
  "message": "Tag 'production-ready' already exists on another version",
  "error": "Bad Request"
}
```

---

## Common Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": [
    "versionNumber must be a positive number",
    "commitMessage should not be empty"
  ],
  "error": "Bad Request"
}
```

---

## Usage Examples

### Example 1: Create and View Version History

```javascript
// 1. Create a manual version
const createResponse = await fetch('/api/v1/stories/123/versions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    versionLabel: 'v1.0',
    versionType: 'MANUAL',
    commitMessage: 'Milestone version',
    isPinned: true
  })
});
const newVersion = await createResponse.json();
console.log('Created version:', newVersion.versionNumber);

// 2. Get version history
const historyResponse = await fetch('/api/v1/stories/123/versions?limit=10', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const versions = await historyResponse.json();
console.log('Total versions:', versions.length);
```

### Example 2: Rollback with Branch Creation

```javascript
const rollbackResponse = await fetch('/api/v1/stories/123/versions/rollback', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    versionNumber: 5,
    commitMessage: 'Rollback to stable version',
    createBranch: true,
    branchName: 'rollback-emergency'
  })
});
const rollbackVersion = await rollbackResponse.json();
console.log('Rollback created on branch:', rollbackVersion.branchName);
```

### Example 3: Compare and Merge

```javascript
// 1. Compare versions first
const compareResponse = await fetch('/api/v1/stories/123/versions/compare', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    versionA: 5,
    versionB: 10
  })
});
const comparison = await compareResponse.json();
console.log('Changes:', comparison.changedFields);

// 2. If acceptable, merge
const mergeResponse = await fetch('/api/v1/stories/123/versions/merge', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fromBranch: 'feature-branch',
    fromVersionNumber: 10,
    targetBranch: 'main',
    commitMessage: 'Merging feature into main'
  })
});
const mergedVersion = await mergeResponse.json();
```

### Example 4: Branch Workflow

```javascript
// 1. Get branch information
const branchesResponse = await fetch('/api/v1/stories/123/versions/branches/info', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const branches = await branchesResponse.json();
console.log('Available branches:', branches.map(b => b.name));

// 2. Create new feature branch
const newBranchResponse = await fetch('/api/v1/stories/123/versions/branch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    branchName: 'feature-new-design',
    fromVersionNumber: 5,
    commitMessage: 'Starting new design work'
  })
});
const branchVersion = await newBranchResponse.json();

// 3. Get versions for specific branch
const branchVersionsResponse = await fetch(
  '/api/v1/stories/123/versions?branchName=feature-new-design',
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
const branchVersions = await branchVersionsResponse.json();
```

---

## TypeScript Types

```typescript
// Enums
export enum VersionType {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
  ROLLBACK = 'ROLLBACK',
  BRANCH = 'BRANCH',
  MERGE = 'MERGE'
}

export enum VersionStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DRAFT = 'DRAFT'
}

// Response Types
export interface VersionUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface VersionResponseDto {
  id: string;
  storyId: number;
  versionNumber: number;
  versionLabel?: string;
  versionType: VersionType;
  status: VersionStatus;
  branchName: string;
  tag?: string;
  changesCount: number;
  changeSummary?: string;
  createdBy: VersionUserDto;
  createdAt: Date;
  commitMessage?: string;
  isPinned: boolean;
  expiresAt?: Date;
}

export interface FieldDiff {
  old: unknown;
  new: unknown;
}

export interface VersionDiff {
  added?: Record<string, unknown>;
  modified?: Record<string, FieldDiff>;
  removed?: Record<string, unknown>;
}

export interface VersionComparisonDto {
  versionA: VersionResponseDto;
  versionB: VersionResponseDto;
  diff: VersionDiff;
  changesCount: number;
  changedFields: string[];
}

export interface BranchInfoDto {
  name: string;
  versionCount: number;
  latestVersion: number;
  lastUpdated: Date;
  isMain: boolean;
}

// Request Types
export interface CreateVersionDto {
  versionLabel?: string;
  versionType: VersionType;
  branchName?: string;
  tag?: string;
  commitMessage?: string;
  isPinned?: boolean;
}

export interface RollbackVersionDto {
  versionNumber: number;
  commitMessage: string;
  createBranch?: boolean;
  branchName?: string;
}

export interface CreateBranchDto {
  branchName: string;
  fromVersionNumber?: number;
  commitMessage?: string;
}

export interface MergeVersionDto {
  fromBranch: string;
  fromVersionNumber: number;
  targetBranch: string;
  commitMessage: string;
  resolveConflicts?: Record<string, unknown>;
}

export interface CompareVersionsDto {
  versionA: number;
  versionB: number;
}

export interface TagVersionDto {
  tag: string;
}
```

---

## Notes for Frontend Implementation

### Pagination
- Default limit: 20
- Maximum limit: 100
- Use `limit` and `offset` query parameters for pagination

### Caching
- Version history responses are cached for 10 minutes
- Individual version responses are cached for 1 hour
- Cache is automatically invalidated on version creation/update

### Permissions
All version endpoints require appropriate ACL permissions:
- **Read permissions**: View version history, compare versions
- **Create permissions**: Create versions, create branches
- **Update permissions**: Rollback, merge, tag versions

### Best Practices
1. **Always show commit messages** to users for better tracking
2. **Implement conflict resolution UI** for merge operations
3. **Display branch visualization** for better understanding
4. **Cache version lists** on frontend to reduce API calls
5. **Show version diffs** in a user-friendly format (side-by-side comparison)
6. **Implement undo functionality** using rollback API
7. **Tag important versions** (releases, milestones) for easy reference

---

## Support

For questions or issues with the API, please contact the backend team or refer to the complete API documentation at `/api/docs`.
