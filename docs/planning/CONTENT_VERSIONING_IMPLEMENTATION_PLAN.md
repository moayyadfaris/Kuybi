# Content Versioning System - Implementation Plan

**Status:** Planning Phase  
**Created:** November 2, 2025  
**Estimated Duration:** 6-8 hours  
**Priority:** High

---

## Executive Summary

Implement a Git-like version control system for Stories with:
- **Complete snapshots** of story content at each version
- **Version chain tracking** for history navigation
- **Branch/merge workflows** for collaborative editing
- **Rollback capabilities** to any previous version
- **Content deduplication** via SHA-256 hashing
- **Automated cleanup** with retention policies

### Current State
- ✅ Simple version number tracking in Story entity
- ✅ Comprehensive audit logging (tracks what changed)
- ❌ No snapshot/rollback capabilities
- ❌ No branch/merge workflows

### Target State
- Complete version history with snapshots
- Visual diff/comparison views
- One-click rollback to any version
- Branch workflows for drafts/experiments
- Merge capabilities for collaborative editing

---

## Architecture Overview

### Data Model
```
Story (1) ──→ (Many) StoryVersion
              ├─ Version Chain: parentVersionId → previous version
              ├─ Branches: branchName (default 'main')
              ├─ Tags: tag (e.g., 'v1.0', 'release-2024-11')
              └─ Content Hash: SHA-256 for deduplication

User (1) ──→ (Many) StoryVersion (createdBy)
```

### Version Types
1. **AUTO** - Created automatically on story update
2. **MANUAL** - User-triggered snapshot
3. **BRANCH** - New branch creation
4. **MERGE** - Merge result from another branch
5. **ROLLBACK** - Restored from previous version

### Workflow Patterns

#### Basic Version Flow
```
Story Update → Auto Version Creation → Version Chain
   ↓
   Calculate Diff from Previous
   ↓
   Generate Content Hash
   ↓
   Save Version + Invalidate Caches
```

#### Branch/Merge Flow
```
Main Branch: v1 → v2 → v3 → v4
                    ↓
                 Feature Branch: v2.1 → v2.2
                                          ↓
                                       Merge → v5
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (2-3 hours)
**Goal:** Database, repository, and basic service layer

#### 1.1 Fix Entity & Run Migration (15 min)
- [ ] Fix lint errors in `StoryVersion` entity (2 `any` types)
- [ ] Run migration `1730496500000-CreateStoryVersionsTable`
- [ ] Verify table creation in PostgreSQL
- [ ] Check enum types created: `version_type_enum`, `version_status_enum`

**Acceptance Criteria:**
- ✅ No lint errors in entity file
- ✅ Migration executes successfully
- ✅ 7 indexes created on `story_versions` table
- ✅ 4 foreign keys established

#### 1.2 Create Repository (30 min)
**File:** `src/modules/stories/repositories/story-version.repository.ts`

**Methods:**
```typescript
class StoryVersionRepository extends BaseRepository<StoryVersion> {
  // Basic queries
  findByStoryId(storyId: number, options?: FindOptions): Promise<StoryVersion[]>
  findVersion(storyId: number, versionNumber: number): Promise<StoryVersion>
  getLatestVersion(storyId: number, branch?: string): Promise<StoryVersion>
  
  // Version chain
  getVersionChain(versionId: string): Promise<StoryVersion[]>
  getVersionTree(storyId: number): Promise<VersionTreeNode[]>
  
  // Branch operations
  getBranches(storyId: number): Promise<string[]>
  getBranchVersions(storyId: number, branch: string): Promise<StoryVersion[]>
  
  // Tag operations
  getTaggedVersions(storyId: number): Promise<StoryVersion[]>
  findByTag(storyId: number, tag: string): Promise<StoryVersion>
  
  // Deduplication
  findByContentHash(hash: string): Promise<StoryVersion[]>
}
```

**Caching Strategy:**
- List queries: TTL 900s (15 min)
- Single version: TTL 3600s (1 hour)
- Version chains: TTL 1800s (30 min)
- Invalidate on: create, update, delete

#### 1.3 Create DTOs (30 min)
**Files:** `src/modules/stories/dto/version/`

```typescript
// create-version.dto.ts
export class CreateVersionDto {
  versionLabel?: string
  versionType: VersionType
  branchName?: string
  tag?: string
  commitMessage?: string
  isPinned?: boolean
}

// rollback-version.dto.ts
export class RollbackVersionDto {
  versionNumber: number
  commitMessage: string
  createBranch?: boolean // Optional: rollback to new branch
}

// create-branch.dto.ts
export class CreateBranchDto {
  branchName: string
  fromVersionNumber?: number // Default: latest
  commitMessage?: string
}

// merge-version.dto.ts
export class MergeVersionDto {
  fromBranch: string
  fromVersionNumber: number
  targetBranch: string
  commitMessage: string
  resolveConflicts?: Record<string, unknown> // Manual conflict resolution
}

// compare-versions.dto.ts
export class CompareVersionsDto {
  versionA: number
  versionB: number
}

// version-response.dto.ts
export class VersionResponseDto {
  id: string
  versionNumber: number
  versionLabel?: string
  versionType: VersionType
  status: VersionStatus
  branchName: string
  tag?: string
  changesCount: number
  changeSummary?: string
  createdBy: UserResponseDto
  createdAt: Date
  commitMessage?: string
  isPinned: boolean
}
```

**Validation:**
- Use `class-validator` decorators
- Custom validator for branch name format (alphanumeric + hyphens)
- Tag format validation (semantic versioning recommended)

---

### Phase 2: Service Layer (2-3 hours)
**Goal:** Business logic for version operations

#### 2.1 Core Version Service (1 hour)
**File:** `src/modules/stories/services/story-version.service.ts`

**Core Methods:**
```typescript
class StoryVersionService {
  // Version creation
  async createVersion(
    story: Story,
    dto: CreateVersionDto,
    userId: string
  ): Promise<StoryVersion>
  
  // History retrieval
  async getVersionHistory(
    storyId: number,
    branch?: string,
    limit?: number
  ): Promise<StoryVersion[]>
  
  async getVersion(
    storyId: number,
    versionNumber: number
  ): Promise<StoryVersion>
  
  // Diff calculation
  async calculateDiff(
    fromVersion: StoryVersion,
    toVersion: StoryVersion
  ): Promise<VersionDiff>
  
  // Content hash
  async generateContentHash(content: VersionContent): Promise<string>
}
```

**Implementation Details:**
- **createVersion:**
  - Snapshot all story fields
  - Serialize relations (tagIds, categoryIds, etc.)
  - Calculate diff from previous version
  - Generate SHA-256 content hash
  - Check for duplicates (same hash)
  - Auto-increment version number
  - Invalidate caches

- **calculateDiff:**
  - Field-by-field comparison
  - Deep diff for JSONB fields (metadata)
  - Array diff for relations
  - Return structured diff object:
    ```typescript
    {
      added: { field: value },
      modified: { field: { old: value, new: value } },
      removed: { field: value }
    }
    ```

- **generateContentHash:**
  - Concatenate: title + details + metadata + relations
  - SHA-256 hash
  - Store for deduplication

#### 2.2 Git Operations (1-2 hours)
**File:** Same as above

**Advanced Methods:**
```typescript
class StoryVersionService {
  // Rollback
  async rollbackToVersion(
    storyId: number,
    dto: RollbackVersionDto,
    userId: string
  ): Promise<{ story: Story; version: StoryVersion }>
  
  // Branch operations
  async createBranch(
    storyId: number,
    dto: CreateBranchDto,
    userId: string
  ): Promise<StoryVersion>
  
  async getBranches(storyId: number): Promise<BranchInfo[]>
  
  // Merge operations
  async mergeVersion(
    storyId: number,
    dto: MergeVersionDto,
    userId: string
  ): Promise<StoryVersion>
  
  async detectConflicts(
    baseVersion: StoryVersion,
    sourceVersion: StoryVersion,
    targetVersion: StoryVersion
  ): Promise<ConflictInfo[]>
  
  // Comparison
  async compareVersions(
    storyId: number,
    dto: CompareVersionsDto
  ): Promise<VersionComparison>
  
  // Tag operations
  async tagVersion(
    storyId: number,
    versionNumber: number,
    tag: string
  ): Promise<StoryVersion>
}
```

**Implementation Details:**
- **rollbackToVersion:**
  - Load target version
  - Create new version with type=ROLLBACK
  - Update story entity with old content
  - Set rolledBackFromVersionId
  - Invalidate story caches

- **createBranch:**
  - Clone version to new branch
  - Maintain parent chain
  - Allow editing without affecting main

- **mergeVersion:**
  - Find common ancestor (LCA algorithm)
  - Detect conflicts (same field changed in both)
  - Auto-merge if no conflicts
  - Return conflict info if manual resolution needed

- **detectConflicts:**
  - Three-way diff (base, source, target)
  - Identify conflicting fields
  - Return conflict details with both values

---

### Phase 3: API Layer (1 hour)
**Goal:** REST endpoints with Swagger docs

#### 3.1 Version Controller
**File:** `src/modules/stories/controllers/story-version.controller.ts`

**Endpoints:**
```typescript
@Controller('stories/:storyId/versions')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class StoryVersionController {
  // List versions
  @Get()
  @CheckAbilities({ action: Action.Read, subject: 'Story' })
  async getVersionHistory(
    @Param('storyId') storyId: number,
    @Query('branch') branch?: string,
    @Query('limit') limit?: number
  ): Promise<VersionResponseDto[]>
  
  // Get specific version
  @Get(':versionNumber')
  @CheckAbilities({ action: Action.Read, subject: 'Story' })
  async getVersion(
    @Param('storyId') storyId: number,
    @Param('versionNumber') versionNumber: number
  ): Promise<VersionResponseDto>
  
  // Manual version creation
  @Post()
  @CheckAbilities({ action: Action.Update, subject: 'Story' })
  async createVersion(
    @Param('storyId') storyId: number,
    @Body() dto: CreateVersionDto,
    @CurrentUser() user: JwtUserPayload
  ): Promise<VersionResponseDto>
  
  // Rollback
  @Post('rollback')
  @CheckAbilities({ action: Action.Update, subject: 'Story' })
  async rollback(
    @Param('storyId') storyId: number,
    @Body() dto: RollbackVersionDto,
    @CurrentUser() user: JwtUserPayload
  ): Promise<{ story: StoryResponseDto; version: VersionResponseDto }>
  
  // Branch operations
  @Post('branch')
  @CheckAbilities({ action: Action.Update, subject: 'Story' })
  async createBranch(
    @Param('storyId') storyId: number,
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: JwtUserPayload
  ): Promise<VersionResponseDto>
  
  @Get('branches')
  @CheckAbilities({ action: Action.Read, subject: 'Story' })
  async getBranches(
    @Param('storyId') storyId: number
  ): Promise<BranchInfo[]>
  
  // Merge
  @Post('merge')
  @CheckAbilities({ action: Action.Update, subject: 'Story' })
  async merge(
    @Param('storyId') storyId: number,
    @Body() dto: MergeVersionDto,
    @CurrentUser() user: JwtUserPayload
  ): Promise<VersionResponseDto>
  
  // Compare
  @Post('compare')
  @CheckAbilities({ action: Action.Read, subject: 'Story' })
  async compare(
    @Param('storyId') storyId: number,
    @Body() dto: CompareVersionsDto
  ): Promise<VersionComparison>
}
```

**Swagger Documentation:**
- Add `@ApiTags('Story Versions')`
- Document all DTOs with examples
- Add response schemas
- Include error responses (404, 403, 409)

---

### Phase 4: Integration (1 hour)
**Goal:** Auto-versioning and module setup

#### 4.1 Auto-Versioning Hook
**File:** `src/modules/stories/services/stories.service.ts`

**Modification:**
```typescript
async update(
  id: number,
  updateStoryDto: UpdateStoryDto,
  userId: string
): Promise<Story> {
  // Load current story
  const story = await this.storyRepository.findById(id)
  
  // Update story
  const updated = await this.storyRepository.update(id, updateStoryDto)
  
  // AUTO-CREATE VERSION
  await this.versionService.createVersion(
    updated,
    {
      versionType: VersionType.AUTO,
      commitMessage: 'Auto-version on update',
      branchName: 'main'
    },
    userId
  )
  
  return updated
}
```

**Considerations:**
- Only version on successful update
- Don't version if no actual changes (compare DTOs)
- Handle version creation failures gracefully
- Log version creation errors

#### 4.2 Module Configuration
**File:** `src/modules/stories/stories.module.ts`

**Updates:**
```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Story, StoryVersion]),
    // ... existing imports
  ],
  controllers: [
    StoriesController,
    StoryVersionController, // ADD
  ],
  providers: [
    StoriesService,
    StoryRepository,
    StoryVersionRepository, // ADD
    StoryVersionService,    // ADD
    // ... existing providers
  ],
  exports: [
    StoriesService,
    StoryVersionService,    // ADD (for other modules)
  ],
})
export class StoriesModule {}
```

#### 4.3 ACL Integration
**File:** `src/modules/acl/abilities/story.ability.ts`

**Add Version Permissions:**
```typescript
// Admin: Full control
can(Action.Manage, 'StoryVersion')

// Author: Can manage own story versions
can(Action.Read, 'StoryVersion', { createdBy: user.id })
can(Action.Update, 'StoryVersion', { createdBy: user.id })

// Editor: Can view versions
can(Action.Read, 'StoryVersion')
```

---

### Phase 5: Background Jobs (30 min)
**Goal:** Automated maintenance

#### 5.1 Version Cleanup Job
**File:** `src/modules/stories/jobs/version-cleanup.job.ts`

**Purpose:** Delete expired, unpinned versions

**Implementation:**
```typescript
@Injectable()
export class VersionCleanupJob {
  constructor(
    private readonly versionRepository: StoryVersionRepository,
    private readonly logger: PinoLogger
  ) {}
  
  @Cron('0 2 * * *') // Daily at 2 AM
  async cleanupExpiredVersions(): Promise<void> {
    const deleted = await this.versionRepository
      .createQueryBuilder('version')
      .where('version.expiresAt < :now', { now: new Date() })
      .andWhere('version.isPinned = false')
      .delete()
      .execute()
    
    this.logger.info(
      { count: deleted.affected },
      'Cleaned up expired versions'
    )
  }
}
```

**Retention Policies:**
- Default: Keep all versions indefinitely
- Optional: Set `expiresAt` for auto-cleanup
- Pinned versions: Never deleted
- Latest version per branch: Never deleted

---

### Phase 6: Testing (1-2 hours)
**Goal:** Comprehensive test coverage

#### 6.1 Unit Tests
**File:** `test/unit/stories/story-version.service.spec.ts`

**Test Cases:**
1. ✅ createVersion - Creates version with correct snapshot
2. ✅ createVersion - Increments version number
3. ✅ createVersion - Generates correct content hash
4. ✅ calculateDiff - Detects added fields
5. ✅ calculateDiff - Detects modified fields
6. ✅ calculateDiff - Detects removed fields
7. ✅ rollbackToVersion - Restores story content
8. ✅ rollbackToVersion - Creates ROLLBACK version type
9. ✅ createBranch - Creates new branch from version
10. ✅ mergeVersion - Auto-merges without conflicts
11. ✅ detectConflicts - Identifies conflicting changes
12. ✅ compareVersions - Returns structured diff

#### 6.2 Integration Tests
**File:** `test/integration/stories/story-versions.spec.ts`

**Test Scenarios:**
1. ✅ GET /stories/:id/versions - Returns version history
2. ✅ GET /stories/:id/versions/:num - Returns specific version
3. ✅ POST /stories/:id/versions - Creates manual version
4. ✅ POST /stories/:id/versions/rollback - Rolls back story
5. ✅ POST /stories/:id/versions/branch - Creates new branch
6. ✅ POST /stories/:id/versions/merge - Merges branches
7. ✅ POST /stories/:id/versions/compare - Compares versions
8. ✅ Auto-versioning on story update
9. ✅ Cache invalidation on version creation
10. ✅ ACL enforcement (author can rollback, viewer cannot)

---

## Database Schema

### story_versions Table
```sql
CREATE TABLE story_versions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Story reference
  story_id INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  
  -- Version metadata
  version_number INT NOT NULL,
  version_label VARCHAR(100),
  version_type version_type_enum DEFAULT 'AUTO',
  status version_status_enum DEFAULT 'ARCHIVED',
  
  -- Complete content snapshot (14 fields from Story)
  title VARCHAR(200) NOT NULL,
  details TEXT,
  type VARCHAR(50) NOT NULL,
  story_status VARCHAR(50) NOT NULL,
  priority VARCHAR(50) NOT NULL,
  from_time TIMESTAMPTZ,
  to_time TIMESTAMPTZ,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  address VARCHAR(255),
  city VARCHAR(100),
  region VARCHAR(100),
  country_id INT,
  metadata JSONB DEFAULT '{}',
  internal_notes TEXT,
  
  -- Relations snapshots (IDs only)
  tag_ids JSONB,
  category_ids JSONB,
  attachment_ids JSONB,
  main_image_id UUID,
  
  -- Version chain
  parent_version_id UUID REFERENCES story_versions(id),
  
  -- Branch/merge
  branch_name VARCHAR(100) DEFAULT 'main',
  tag VARCHAR(100),
  merged_from_version_id UUID REFERENCES story_versions(id),
  
  -- Change tracking
  changes JSONB,
  change_summary TEXT,
  changes_count INT DEFAULT 0,
  
  -- Deduplication
  content_hash VARCHAR(64),
  
  -- Author
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  commit_message TEXT,
  
  -- Rollback
  is_rollback BOOLEAN DEFAULT false,
  rolled_back_from_version_id UUID REFERENCES story_versions(id),
  
  -- Retention
  is_pinned BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ
)
```

### Indexes (7 total)
1. `(story_id, version_number)` - Version lookup
2. `(story_id, created_at)` - Chronological queries
3. `(branch_name)` - Branch filtering
4. `(tag)` - Tag lookup
5. `(created_by)` - Author filtering
6. `(content_hash)` - Deduplication
7. `(status)` - Status filtering

---

## API Examples

### Create Manual Version
```bash
POST /api/stories/123/versions
Authorization: Bearer {token}
Content-Type: application/json

{
  "versionLabel": "v1.0",
  "versionType": "MANUAL",
  "tag": "release-2024-11",
  "commitMessage": "Final release version",
  "isPinned": true
}
```

### Rollback to Version 5
```bash
POST /api/stories/123/versions/rollback
Authorization: Bearer {token}
Content-Type: application/json

{
  "versionNumber": 5,
  "commitMessage": "Rollback to stable version before bug"
}
```

### Create Feature Branch
```bash
POST /api/stories/123/versions/branch
Authorization: Bearer {token}
Content-Type: application/json

{
  "branchName": "draft-improvements",
  "fromVersionNumber": 10,
  "commitMessage": "Starting draft improvements"
}
```

### Merge Branch
```bash
POST /api/stories/123/versions/merge
Authorization: Bearer {token}
Content-Type: application/json

{
  "fromBranch": "draft-improvements",
  "fromVersionNumber": 12,
  "targetBranch": "main",
  "commitMessage": "Merge draft improvements into main"
}
```

### Compare Versions
```bash
POST /api/stories/123/versions/compare
Authorization: Bearer {token}
Content-Type: application/json

{
  "versionA": 5,
  "versionB": 10
}

# Response:
{
  "versionA": { "versionNumber": 5, "createdAt": "..." },
  "versionB": { "versionNumber": 10, "createdAt": "..." },
  "diff": {
    "added": {},
    "modified": {
      "title": {
        "old": "Old Title",
        "new": "New Title"
      },
      "priority": {
        "old": "LOW",
        "new": "HIGH"
      }
    },
    "removed": {}
  },
  "changesCount": 2
}
```

---

## Performance Considerations

### Caching Strategy
- **Version lists:** 15 min TTL
- **Single version:** 1 hour TTL
- **Version chains:** 30 min TTL
- **Invalidation:** On create/update/delete

### Storage Optimization
- **Content hash deduplication:** Skip storing duplicate snapshots
- **Retention policies:** Auto-delete expired versions
- **Pinned versions:** Keep important milestones forever
- **Archive old versions:** Move to cold storage after 6 months

### Query Optimization
- **Indexes:** 7 strategic indexes on `story_versions`
- **Eager loading:** Load user relation in version queries
- **Pagination:** Limit version history to 50 by default
- **Lazy loading:** Don't load full content in list views

---

## Risk Mitigation

### Potential Issues
1. **Storage growth:** Versions accumulate quickly
   - **Mitigation:** Content hash deduplication, retention policies, cleanup jobs

2. **Migration conflicts:** Large story table
   - **Mitigation:** Run migration during low-traffic hours, test on staging

3. **Performance impact:** Version creation on every update
   - **Mitigation:** Async version creation, skip if no changes, caching

4. **Merge conflicts:** Complex three-way diffs
   - **Mitigation:** Manual conflict resolution UI, clear conflict indicators

### Rollback Plan
- Keep migration down() method functional
- Test rollback on staging before production
- Database backup before migration
- Feature flag for auto-versioning (can disable if issues)

---

## Success Metrics

### Technical Metrics
- ✅ All tests pass (unit + integration)
- ✅ No lint errors
- ✅ Migration executes < 30 seconds
- ✅ Version creation < 100ms
- ✅ Version retrieval < 50ms (cached)

### Business Metrics
- ✅ Users can view complete version history
- ✅ One-click rollback works reliably
- ✅ Branch/merge workflow functions
- ✅ Visual diff shows clear changes
- ✅ Auto-versioning triggers on updates

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 1. Core Infrastructure | 2-3 hours | Migration, Repository, DTOs |
| 2. Service Layer | 2-3 hours | Phase 1 complete |
| 3. API Layer | 1 hour | Phase 2 complete |
| 4. Integration | 1 hour | Phase 3 complete |
| 5. Background Jobs | 30 min | Phase 1 complete |
| 6. Testing | 1-2 hours | Phases 1-4 complete |
| **TOTAL** | **6-8 hours** | Sequential execution |

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Fix lint errors** in StoryVersion entity (2 min)
3. **Run migration** (5 min)
4. **Start Phase 1** implementation
5. **Test incrementally** after each phase
6. **Document API** as you build
7. **Deploy to staging** for QA
8. **Production release** after validation

---

## Questions for Discussion

1. **Auto-versioning frequency:** Create version on every update, or batch by time?
2. **Retention policy:** Default expiration period for versions?
3. **Branch permissions:** Can all authors create branches, or admin-only?
4. **Merge UI:** Automatic conflict resolution, or always require manual review?
5. **Storage limits:** Max versions per story (e.g., 100)?

---

**Ready to proceed?** Let's start with Phase 1! 🚀
