# Story Version Control - Frontend Implementation Guide

## Overview
This guide provides UI/UX recommendations and API documentation for implementing Git-like version control for stories. The system allows tracking changes, viewing history, comparing versions, and rolling back to previous states.

---

## 🎨 Recommended UI Components

### 1. **Version History Sidebar/Panel**
**Location**: Story Edit Screen  
**Placement**: Right sidebar or collapsible panel

**Features**:
- Timeline view showing all versions
- Version number, timestamp, and author
- Commit message for each version
- Visual indicators for version types (MANUAL, AUTO, ROLLBACK, BRANCH, MERGE)
- Branch selector dropdown
- "Compare" and "Rollback" action buttons

**Design Pattern**: Similar to GitHub's commit history or Google Docs version history

---

### 2. **Version History Screen (Full Page)**
**Location**: Accessible from story listing or edit screen  
**Route**: `/stories/{storyId}/versions`

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ Story: "Breaking News Title"                    [← Back]     │
├─────────────────────────────────────────────────────────────┤
│ Branch: [main ▼]                                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Timeline View                    Content Preview            │
│  ═══════════════                  ═══════════════            │
│                                                               │
│  ● v6 (Current)                   [Full content preview]     │
│    ROLLBACK                       Title: Breaking News       │
│    2 hours ago                    Status: Published          │
│    by John Doe                    Details: Lorem ipsum...    │
│    "Rolled back to v5"                                       │
│    [Compare] [View]                                          │
│                                                               │
│  ● v5                                                         │
│    MANUAL                                                     │
│    3 hours ago                                               │
│    by Jane Smith                                             │
│    "Updated headline"                                        │
│    [Compare] [Rollback] [View]                               │
│                                                               │
│  ● v4                                                         │
│    AUTO                                                       │
│    1 day ago                                                 │
│    by John Doe                                               │
│    "Auto-save"                                               │
│    [Compare] [Rollback] [View]                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. **Version Comparison Modal/Screen**
**Trigger**: Click "Compare" button on any version

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│                    Compare Versions                    [×]   │
├─────────────────────────────────────────────────────────────┤
│  From: [v4 ▼]                    To: [v6 (Current) ▼]       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Changes Summary: 3 modified fields                          │
│                                                               │
│  Title                                                        │
│  - "Breaking News Update"          (v4)                      │
│  + "Breaking News: Major Event"    (v6)                      │
│                                                               │
│  Status                                                       │
│  - draft                           (v4)                      │
│  + published                       (v6)                      │
│                                                               │
│  Details                                                      │
│  [Side-by-side diff view with highlighted changes]          │
│                                                               │
│                              [Rollback to v4] [Close]        │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. **Quick Version Badge (Story Edit Screen)**
**Location**: Top of story edit form

```
┌─────────────────────────────────────────────────────────────┐
│  Story #123 - Breaking News                                  │
│  Version: v6 (Current) • Last saved 2 hours ago              │
│  [View History] [Create Snapshot]                            │
└─────────────────────────────────────────────────────────────┘
```

---

### 5. **Rollback Confirmation Modal**
**Trigger**: Click "Rollback" button

```
┌─────────────────────────────────────────────────────────────┐
│                 Rollback to Version 5?                  [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ⚠️ This will revert the story to its state at version 5    │
│                                                               │
│  Current version: v6 (Published)                             │
│  Target version: v5 (Draft)                                  │
│                                                               │
│  Changes that will be reverted:                              │
│  • Title will change                                         │
│  • Status will change from Published to Draft                │
│  • Details will be restored                                  │
│                                                               │
│  Commit message (optional):                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Rolled back to v5                                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  □ Create a new branch for this rollback                     │
│                                                               │
│                          [Cancel] [Rollback Story]           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📡 API Reference

### Base URL
All endpoints use the base URL: `http://localhost:4040/api/v1/stories/{storyId}/versions`

**Authentication**: All endpoints require JWT Bearer token in the `Authorization` header.

---

### 1. Get Version History

**Endpoint**: `GET /api/v1/stories/{storyId}/versions`

**Description**: Retrieve paginated version history for a story.

**URL Parameters**:
- `storyId` (number, required): The story ID

**Query Parameters**:
- `limit` (number, optional): Items per page (default: 20, max: 100)
- `offset` (number, optional): Offset for pagination (default: 0)
- `branchName` (string, optional): Filter by branch name (default: "main")

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions?limit=20&offset=0',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);
const versions = await response.json();
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-123",
      "storyId": 8,
      "versionNumber": 6,
      "versionType": "ROLLBACK",
      "status": "ACTIVE",
      "branchName": "main",
      "commitMessage": "Rolled back to version 5",
      "title": "Breaking News: Major Event",
      "details": "Story content...",
      "type": "STORY",
      "storyStatus": "PUBLISHED",
      "priority": "HIGH",
      "changes": { "title": "Updated", "status": "Changed" },
      "changesCount": 2,
      "changeSummary": "Rolled back to version 5",
      "createdBy": {
        "id": "user-id",
        "email": "john@example.com",
        "firstName": "John",
        "lastName": "Doe"
      },
      "createdAt": "2025-11-16T12:00:00Z",
      "isRollback": true,
      "isPinned": false
    },
    {
      "id": "uuid-122",
      "versionNumber": 5,
      "versionType": "MANUAL",
      "commitMessage": "Updated headline",
      "createdAt": "2025-11-16T10:00:00Z",
      // ... more fields
    }
  ],
  "pagination": {
    "total": 6,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

**Use Case**: Display timeline in version history panel/screen.

---

### 2. Get Specific Version

**Endpoint**: `GET /api/v1/stories/{storyId}/versions/{versionNumber}`

**Description**: Retrieve a specific version by its version number.

**URL Parameters**:
- `storyId` (number, required)
- `versionNumber` (number, required)

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions/5',
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
const version = await response.json();
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-122",
    "versionNumber": 5,
    "title": "Breaking News Update",
    "details": "Full story content from version 5...",
    "type": "STORY",
    "storyStatus": "DRAFT",
    "priority": "NORMAL",
    "fromTime": "2025-11-15T10:00:00Z",
    "toTime": null,
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "123 Main St",
    "city": "New York",
    "region": "NY",
    "countryId": 1,
    "metadata": { "source": "web" },
    "tagIds": [1, 2, 3],
    "categoryIds": ["cat-uuid-1"],
    "attachmentIds": ["att-uuid-1"],
    "createdBy": { /* user info */ },
    "createdAt": "2025-11-16T10:00:00Z"
  }
}
```

**Use Case**: Preview version content in detail view or comparison.

---

### 3. Create Manual Snapshot

**Endpoint**: `POST /api/v1/stories/{storyId}/versions`

**Description**: Create a manual snapshot of the current story state.

**URL Parameters**:
- `storyId` (number, required)

**Request Body**:
```json
{
  "versionType": "MANUAL",
  "commitMessage": "Before major edits",
  "versionLabel": "v1.2-stable",
  "branchName": "main",
  "tag": "stable",
  "isPinned": false
}
```

**Fields**:
- `versionType` (enum, required): "MANUAL" | "AUTO" | "BRANCH" | "MERGE" | "ROLLBACK"
- `commitMessage` (string, optional): Description of changes
- `versionLabel` (string, optional): Custom label (e.g., "v1.0", "release-candidate")
- `branchName` (string, optional): Branch name (default: "main")
- `tag` (string, optional): Tag for easy reference (e.g., "stable", "release")
- `isPinned` (boolean, optional): Pin this version (default: false)

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      versionType: 'MANUAL',
      commitMessage: 'Saving before major changes',
      tag: 'checkpoint'
    })
  }
);
const newVersion = await response.json();
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "versionNumber": 7,
    "versionType": "MANUAL",
    "commitMessage": "Saving before major changes",
    "tag": "checkpoint",
    // ... full version data
  }
}
```

**Use Case**: 
- User clicks "Create Snapshot" before making risky edits
- Auto-save functionality (use versionType: "AUTO")
- Before publishing (tag: "pre-publish")

---

### 4. Rollback to Version

**Endpoint**: `POST /api/v1/stories/{storyId}/versions/rollback`

**Description**: Rollback story to a previous version. This creates a new ROLLBACK version and **updates the actual story content**.

**URL Parameters**:
- `storyId` (number, required)

**Request Body**:
```json
{
  "versionNumber": 5,
  "commitMessage": "Reverting unwanted changes",
  "createBranch": false,
  "branchName": "rollback-branch"
}
```

**Fields**:
- `versionNumber` (number, required): Target version to rollback to
- `commitMessage` (string, optional): Reason for rollback
- `createBranch` (boolean, optional): Create a new branch instead of updating main (default: false)
- `branchName` (string, optional): Branch name if createBranch is true

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions/rollback',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      versionNumber: 5,
      commitMessage: 'Rolled back to stable version',
      createBranch: false
    })
  }
);
const rollbackVersion = await response.json();
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-124",
    "versionNumber": 8,
    "versionType": "ROLLBACK",
    "commitMessage": "Rolled back to stable version",
    "isRollback": true,
    "rolledBackFromVersionId": "uuid-122",
    "changesCount": 3,
    "changeSummary": "Rolled back to version 5",
    // ... full version data
  }
}
```

**Important Notes**:
- ✅ The story content IS immediately updated
- ✅ A new ROLLBACK version is created in history
- ✅ The rollback operation itself becomes part of the version history
- ⚠️ This action cannot be undone (but you can rollback again)

**Use Case**:
- User accidentally published wrong content
- Revert to last stable version
- Undo recent changes after testing

---

### 5. Compare Versions

**Endpoint**: `POST /api/v1/stories/{storyId}/versions/compare`

**Description**: Compare two versions to see what changed.

**URL Parameters**:
- `storyId` (number, required)

**Request Body**:
```json
{
  "fromVersionNumber": 4,
  "toVersionNumber": 6
}
```

**Fields**:
- `fromVersionNumber` (number, required): Starting version
- `toVersionNumber` (number, required): Ending version

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions/compare',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fromVersionNumber: 4,
      toVersionNumber: 6
    })
  }
);
const comparison = await response.json();
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "fromVersion": {
      "versionNumber": 4,
      "title": "Breaking News Update",
      "storyStatus": "DRAFT",
      "createdAt": "2025-11-15T10:00:00Z"
    },
    "toVersion": {
      "versionNumber": 6,
      "title": "Breaking News: Major Event",
      "storyStatus": "PUBLISHED",
      "createdAt": "2025-11-16T12:00:00Z"
    },
    "diff": {
      "added": {
        "address": "123 Main St"
      },
      "modified": {
        "title": {
          "old": "Breaking News Update",
          "new": "Breaking News: Major Event"
        },
        "storyStatus": {
          "old": "DRAFT",
          "new": "PUBLISHED"
        },
        "details": {
          "old": "Original content...",
          "new": "Updated content..."
        }
      },
      "removed": {
        "internalNotes": "Old note"
      }
    },
    "summary": "3 fields modified, 1 added, 1 removed",
    "totalChanges": 5
  }
}
```

**Use Case**: 
- Show visual diff before rollback
- Display "what changed" in version history
- Audit trail for content changes

---

### 6. Create Branch

**Endpoint**: `POST /api/v1/stories/{storyId}/versions/branch`

**Description**: Create a new branch from a specific version or latest.

**URL Parameters**:
- `storyId` (number, required)

**Request Body**:
```json
{
  "branchName": "experiment-new-format",
  "fromVersionNumber": 5,
  "commitMessage": "Experimenting with new layout"
}
```

**Fields**:
- `branchName` (string, required): Name for the new branch
- `fromVersionNumber` (number, optional): Version to branch from (default: latest)
- `commitMessage` (string, optional): Description

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions/branch',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      branchName: 'experiment-headline',
      fromVersionNumber: 5,
      commitMessage: 'Testing new headline variations'
    })
  }
);
const branch = await response.json();
```

**Use Case**:
- Test different story variations without affecting main version
- A/B testing different headlines
- Collaborative editing with isolated changes

---

### 7. Merge Branch

**Endpoint**: `POST /api/v1/stories/{storyId}/versions/merge`

**Description**: Merge changes from one branch into another.

**URL Parameters**:
- `storyId` (number, required)

**Request Body**:
```json
{
  "sourceBranchName": "experiment-headline",
  "targetBranchName": "main",
  "commitMessage": "Merged successful experiment",
  "strategy": "theirs"
}
```

**Fields**:
- `sourceBranchName` (string, required): Branch to merge from
- `targetBranchName` (string, required): Branch to merge into
- `commitMessage` (string, optional): Merge description
- `strategy` (enum, optional): Conflict resolution - "ours" | "theirs" | "manual" (default: "manual")

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions/merge',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sourceBranchName: 'experiment-headline',
      targetBranchName: 'main',
      commitMessage: 'Merging improved headline',
      strategy: 'theirs'
    })
  }
);
const mergeResult = await response.json();
```

**Response** (with conflicts):
```json
{
  "success": false,
  "hasConflicts": true,
  "conflicts": {
    "title": {
      "ours": "Breaking News: Major Event",
      "theirs": "Breaking News: Experimental Title"
    },
    "details": {
      "ours": "Main branch content...",
      "theirs": "Experimental content..."
    }
  },
  "message": "Merge conflicts detected. Please resolve manually."
}
```

**Use Case**:
- Apply experimental changes to main story
- Collaborative editing workflow
- Feature branch workflow

---

### 8. Get Branch Information

**Endpoint**: `GET /api/v1/stories/{storyId}/versions/branches/info`

**Description**: Get statistics and information about all branches.

**URL Parameters**:
- `storyId` (number, required)

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions/branches/info',
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);
const branchInfo = await response.json();
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "branches": ["main", "experiment-headline", "draft-v2"],
    "branchCount": 3,
    "activeBranch": "main",
    "branchDetails": [
      {
        "name": "main",
        "versionCount": 6,
        "latestVersion": 6,
        "lastUpdated": "2025-11-16T12:00:00Z"
      },
      {
        "name": "experiment-headline",
        "versionCount": 2,
        "latestVersion": 7,
        "lastUpdated": "2025-11-16T11:00:00Z"
      }
    ]
  }
}
```

**Use Case**: Branch selector dropdown in UI

---

### 9. Tag Version

**Endpoint**: `POST /api/v1/stories/{storyId}/versions/{versionNumber}/tag`

**Description**: Add or update a tag for a specific version.

**URL Parameters**:
- `storyId` (number, required)
- `versionNumber` (number, required)

**Request Body**:
```json
{
  "tag": "release-1.0"
}
```

**Example Request**:
```javascript
const response = await fetch(
  'http://localhost:4040/api/v1/stories/8/versions/5/tag',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tag: 'stable'
    })
  }
);
const taggedVersion = await response.json();
```

**Use Case**: 
- Mark versions as "stable", "release", "tested"
- Easy reference for important versions
- Quick rollback to tagged versions

---

## 🎯 Recommended User Workflows

### Workflow 1: Basic Version History View
```
1. User opens story edit screen
2. User clicks "View History" button
3. Display timeline of all versions
4. User can click any version to preview its content
5. User can compare any two versions
6. User can rollback if needed
```

### Workflow 2: Safe Rollback with Comparison
```
1. User navigates to version history
2. User selects an old version (e.g., v5)
3. System shows "Compare with Current" automatically
4. User reviews changes that will be reverted
5. User confirms rollback with optional message
6. System updates story and creates rollback version
7. Success message: "Story rolled back to version 5"
```

### Workflow 3: Manual Snapshot Before Major Edit
```
1. User is editing story
2. User clicks "Create Snapshot" before making big changes
3. Modal appears: "Save current state?"
4. User adds commit message: "Before redesign"
5. System creates MANUAL version
6. User proceeds with edits confidently
7. If needed, user can rollback to this snapshot
```

### Workflow 4: Branch for Experiments
```
1. User wants to test different headline
2. User clicks "Create Branch"
3. User names branch: "experiment-catchy-title"
4. User edits story in new branch
5. User can switch between main and experiment branch
6. If experiment succeeds, user merges back to main
7. If experiment fails, user deletes branch
```

---

## 🎨 UI Component Code Examples

### React: Version History Timeline
```jsx
import React, { useState, useEffect } from 'react';

function VersionHistory({ storyId, token }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVersions();
  }, [storyId]);

  const fetchVersions = async () => {
    try {
      const response = await fetch(
        `http://localhost:4040/api/v1/stories/${storyId}/versions`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      setVersions(data.data);
    } catch (error) {
      console.error('Failed to fetch versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (versionNumber) => {
    if (!confirm(`Rollback to version ${versionNumber}?`)) return;

    try {
      const response = await fetch(
        `http://localhost:4040/api/v1/stories/${storyId}/versions/rollback`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            versionNumber,
            commitMessage: `Rolled back to version ${versionNumber}`
          })
        }
      );
      
      if (response.ok) {
        alert('Story rolled back successfully!');
        fetchVersions(); // Refresh list
        // Refresh story content in parent component
      }
    } catch (error) {
      alert('Rollback failed: ' + error.message);
    }
  };

  if (loading) return <div>Loading versions...</div>;

  return (
    <div className="version-history">
      <h3>Version History</h3>
      <div className="timeline">
        {versions.map((version) => (
          <div key={version.id} className="version-item">
            <div className="version-badge">
              v{version.versionNumber}
            </div>
            <div className="version-content">
              <div className="version-header">
                <span className={`type-badge ${version.versionType}`}>
                  {version.versionType}
                </span>
                <span className="timestamp">
                  {new Date(version.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="commit-message">
                {version.commitMessage || 'No message'}
              </div>
              <div className="author">
                by {version.createdBy.firstName} {version.createdBy.lastName}
              </div>
              {version.changesCount > 0 && (
                <div className="changes">
                  {version.changesCount} changes
                </div>
              )}
              <div className="actions">
                <button onClick={() => handleCompare(version.versionNumber)}>
                  Compare
                </button>
                {version.versionNumber !== versions[0].versionNumber && (
                  <button onClick={() => handleRollback(version.versionNumber)}>
                    Rollback
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VersionHistory;
```

---

## 🔐 Permission Requirements

**Read Permissions** (View history, compare):
- `StoryVersion:read`

**Write Permissions** (Create snapshots, rollback, branch):
- `StoryVersion:create` - Create manual snapshots
- `StoryVersion:update` - Rollback, merge branches
- `Story:update` - Required for rollback (updates story content)

**Admin Permissions**:
- Delete versions
- Force merge without conflict resolution

---

## 🎯 Key Design Principles

1. **Non-Destructive**: All actions preserve history
2. **Transparent**: Users always see what will change
3. **Confirmations**: Destructive actions require confirmation with preview
4. **Context**: Show commit messages and change summaries everywhere
5. **Accessibility**: Timeline view with keyboard navigation
6. **Real-time**: Auto-refresh when changes occur
7. **Performance**: Paginate long version histories

---

## 📱 Mobile Considerations

**Simplified Mobile UI**:
- Collapsed timeline with expandable items
- Swipe actions for quick rollback/compare
- Bottom sheet for version details
- Reduced button sizes
- Touch-friendly compare view

---

## 🚀 Implementation Priority

### Phase 1 (MVP):
1. ✅ Version history timeline (read-only)
2. ✅ Rollback functionality with confirmation
3. ✅ Basic version comparison

### Phase 2 (Enhanced):
4. Manual snapshot creation
5. Version preview modal
6. Advanced comparison with side-by-side diff

### Phase 3 (Advanced):
7. Branch creation and management
8. Branch merging
9. Tag management
10. Version pinning

---

## 💡 Additional Features to Consider

1. **Auto-save versions**: Create AUTO versions every 5 minutes while editing
2. **Version labels**: Allow custom labels like "v1.0-beta"
3. **Version notes**: Add notes to any version after creation
4. **Version export**: Download specific version as JSON
5. **Bulk operations**: Rollback multiple stories at once
6. **Version search**: Search commit messages
7. **Visual diff**: Highlight text changes character-by-character
8. **Conflict resolution UI**: Manual merge conflict resolver
9. **Version analytics**: Track which versions are most viewed
10. **Collaborative indicators**: Show who created each version

---

## ❓ FAQ

**Q: Does rollback delete the newer versions?**  
A: No! Rollback creates a new version. All history is preserved.

**Q: Can we undo a rollback?**  
A: Yes! Just rollback again to any version, including the one before the rollback.

**Q: What happens to tags, categories, and attachments during rollback?**  
A: Currently, only the main story fields are restored. Relationships are tracked in version history but not automatically restored. This can be added if needed.

**Q: How many versions are stored?**  
A: All versions are stored indefinitely. Consider implementing archival for very old versions.

**Q: Can we compare versions from different branches?**  
A: Yes! The compare API works across branches.

---

## 🛠️ Testing Checklist

- [ ] Display version history timeline
- [ ] Show correct version types (badges/colors)
- [ ] Compare two versions shows diff
- [ ] Rollback updates story content
- [ ] Rollback creates new version record
- [ ] Commit messages display correctly
- [ ] Author information shows
- [ ] Pagination works for long histories
- [ ] Branch selector switches branches
- [ ] Error handling for failed operations
- [ ] Loading states during API calls
- [ ] Confirmation modals work
- [ ] Mobile responsive design

---

## 📞 Support

For questions or issues with the API:
- Check API documentation: `http://localhost:4040/api/docs`
- Review version entity structure in backend code
- Test endpoints in Postman/Insomnia
- Contact backend team for clarification

---

**Last Updated**: November 16, 2025  
**API Version**: v1  
**Status**: ✅ Ready for implementation
