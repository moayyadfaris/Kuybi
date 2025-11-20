# Shared Codebase Management Strategy

## 🎯 Problem Statement

**Current Situation:**
- Kuybi repo is used as a base for multiple company microservices
- Every update to main branch requires manual communication to teams
- Teams manually check file diffs and copy/paste changes
- No standardized update process
- Risk of version drift between services

**Goal:** Establish an organized, scalable strategy for managing shared codebase updates across multiple microservices.

---

## 📋 Solution Strategies

### Strategy 1: NPM Package Approach ⭐ (Recommended)

#### Overview
Convert Kuybi backend into a reusable npm package that teams install as a dependency.

#### Architecture
```
Repository Structure:

@company/kuybi-core (npm package)
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   ├── acl/
│   │   ├── users/
│   │   └── audit/
│   ├── core/
│   │   ├── cache/
│   │   ├── database/
│   │   └── logging/
│   ├── shared/
│   └── index.ts          # Public API exports
├── package.json
└── README.md

Team's Microservice:
├── package.json          # "@company/kuybi-core": "^1.2.0"
├── src/
│   ├── app.module.ts     # Imports from kuybi-core
│   ├── business/         # Custom business logic
│   └── main.ts
```

#### Implementation Steps

**Step 1: Prepare Core Package**
```json
// kuybi-core/package.json
{
  "name": "@company/kuybi-core",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "peerDependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "typeorm": "^0.3.0"
  }
}
```

**Step 2: Export Public API**
```typescript
// kuybi-core/src/index.ts
// Modules
export * from './modules/auth/auth.module'
export * from './modules/acl/acl.module'
export * from './modules/users/users.module'

// Entities
export * from './modules/users/entities/user.entity'
export * from './modules/acl/entities/role.entity'

// Services
export * from './modules/auth/services/auth.service'

// Guards
export * from './modules/acl/guards/super-admin.guard'

// DTOs
export * from './modules/auth/dto'
```

**Step 3: Publish to Private Registry**

**Option A: NPM Private Packages** ($7/user/month)
```bash
npm login --scope=@company --registry=https://registry.npmjs.org
npm publish --access restricted
```

**Option B: GitHub Packages** (Free for private repos)
```bash
# .npmrc in kuybi-core
@company:registry=https://npm.pkg.github.com

# Publish
npm publish
```

**Option C: Verdaccio** (Self-hosted, Free)
```bash
# Install Verdaccio
npm install -g verdaccio

# Run
verdaccio

# Configure .npmrc
registry=http://localhost:4873
```

**Step 4: Team Consumption**
```typescript
// team-service/src/app.module.ts
import { Module } from '@nestjs/common'
import { 
  AuthModule, 
  AclModule, 
  UsersModule 
} from '@company/kuybi-core'

@Module({
  imports: [
    AuthModule.forRoot({
      jwtSecret: process.env.JWT_SECRET
    }),
    AclModule,
    UsersModule,
    // Custom modules
    OrdersModule,
    PaymentsModule
  ]
})
export class AppModule {}
```

**Step 5: Update Process**
```bash
# Team updates the package
npm update @company/kuybi-core

# Or specific version
npm install @company/kuybi-core@1.2.0

# Check what changed
npm view @company/kuybi-core versions
```

#### Versioning Strategy

Use **Semantic Versioning (SemVer)**: `MAJOR.MINOR.PATCH`

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
  - Changed API contracts
  - Removed features
  - Database schema changes requiring migration

- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
  - New modules
  - New endpoints
  - Optional new features

- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward compatible
  - Security patches
  - Bug fixes
  - Performance improvements

#### Benefits
✅ Standard npm workflow (familiar to all developers)  
✅ Automatic dependency management  
✅ Clear versioning with semver  
✅ Teams control when to upgrade  
✅ Can use npm audit for security  
✅ TypeScript definitions included  
✅ Tree-shaking for smaller bundles  

#### Challenges
⚠️ Initial setup time (1-2 weeks)  
⚠️ Need private registry infrastructure  
⚠️ Must maintain backward compatibility  
⚠️ Breaking changes require major version bumps  

#### Best For
- 3+ teams using the codebase
- Teams with different release schedules
- Need for version pinning
- Want standard Node.js workflow

---

### Strategy 2: Git Subtree/Submodule

#### Overview
Keep shared code in one repository, teams pull updates via Git mechanisms.

#### Option A: Git Subtree (Simpler)

**Initial Setup:**
```bash
# In team's repository
git subtree add \
  --prefix=shared/kuybi \
  https://github.com/company/kuybi.git main \
  --squash
```

**Pull Updates:**
```bash
# Fetch and merge changes from Kuybi
git subtree pull \
  --prefix=shared/kuybi \
  https://github.com/company/kuybi.git main \
  --squash
```

**Team's Structure:**
```
team-service/
├── shared/
│   └── kuybi/           # Subtree from kuybi repo
│       ├── src/
│       └── package.json
├── src/
│   ├── app.module.ts    # Imports from ../shared/kuybi
│   └── custom/
├── package.json
└── tsconfig.json        # Configure paths to shared/kuybi
```

**TypeScript Configuration:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@kuybi/*": ["shared/kuybi/src/*"],
      "@modules/*": ["shared/kuybi/src/modules/*"],
      "@core/*": ["shared/kuybi/src/core/*"]
    }
  }
}
```

#### Option B: Git Submodule (More Explicit)

**Initial Setup:**
```bash
# Add as submodule
git submodule add \
  https://github.com/company/kuybi.git \
  shared/kuybi

# Initialize
git submodule init
git submodule update
```

**Pull Updates:**
```bash
# Update submodule to latest
git submodule update --remote

# Or specific commit/tag
cd shared/kuybi
git checkout v1.2.0
cd ../..
git add shared/kuybi
git commit -m "Update kuybi to v1.2.0"
```

**Clone Team Repo (with submodules):**
```bash
# New team member clones
git clone --recurse-submodules https://github.com/company/team-service.git

# Or if already cloned
git submodule init
git submodule update
```

#### Benefits
✅ Git-native solution (no external tools)  
✅ Full source code available for debugging  
✅ Can make local modifications temporarily  
✅ Clear separation of shared vs custom code  
✅ Version tracking via commits/tags  

#### Challenges
⚠️ Merge conflicts possible  
⚠️ Submodules can be confusing for developers  
⚠️ Must remember to update submodules  
⚠️ CI/CD needs submodule support  

#### Best For
- 2-3 teams
- Teams comfortable with Git
- Need full source code access
- Want simple solution without npm registry

---

### Strategy 3: Changelog + Migration Scripts

#### Overview
Maintain detailed changelogs and provide automated migration scripts for updates.

#### Structure
```
kuybi/
├── CHANGELOG.md
├── MIGRATION_GUIDES/
│   ├── v1.0-to-v1.1.md
│   ├── v1.1-to-v1.2.md
│   └── scripts/
│       ├── migrate-1.0-1.1.sh
│       ├── migrate-1.1-1.2.sh
│       └── check-version.js
├── docs/
│   ├── BREAKING_CHANGES.md
│   ├── UPGRADE_STRATEGY.md
│   └── RELEASE_NOTES/
│       ├── 2025-11-12-rbac-release.md
│       └── 2025-10-15-audit-release.md
└── scripts/
    └── diff-generator.sh
```

#### CHANGELOG.md Example

```markdown
# Changelog

All notable changes to Kuybi will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-11-12

### 🎉 New Features

- **RBAC System**: Added comprehensive role-based access control
  - Role hierarchy: super-admin > admin > moderator > user > guest
  - `SuperAdminGuard` for protected endpoints
  - `RoleHierarchyGuard` for role-based authorization
  - `AbilityGuard` for fine-grained permissions

- **Session Management**: Super-admin session control
  - GET `/api/v1/sessions/users/:userId` - List any user's sessions
  - DELETE `/api/v1/sessions/users/:userId/sessions/:sessionId` - Revoke specific session
  - DELETE `/api/v1/sessions/users/:userId/sessions` - Revoke all user sessions

### ⚠️ BREAKING CHANGES

#### 1. User Entity Migration
**Impact**: HIGH - All teams must migrate

**What Changed:**
- Removed `role` column (string)
- Added `primaryRoleId` column (uuid, foreign key to roles table)

**Why:**
- Support multiple roles per user
- Enable role hierarchy
- Improve security and flexibility

**Migration Required:**
```bash
# Run this script to migrate your database
./MIGRATION_GUIDES/scripts/migrate-1.1-1.2.sh

# Or manual steps:
# 1. Add primaryRoleId column
# 2. Migrate data from role to primaryRoleId
# 3. Drop role column
# 4. Update foreign key constraints
```

**Code Changes Required:**

```typescript
// BEFORE (v1.1)
const user = await userFactory.create({
  email: 'test@example.com',
  role: 'admin'
})

// AFTER (v1.2)
const user = await userFactory.create({
  email: 'test@example.com',
  primaryRoleId: 1  // Reference to roles table
})
```

**Files You Need to Update:**
- `test/factories/user.factory.ts`
- All test files creating users
- Any direct User entity instantiation
- User creation APIs/services

**Testing Checklist:**
- [ ] Run migration script
- [ ] Update UserFactory usage
- [ ] Update test files
- [ ] Verify user authentication still works
- [ ] Check role-based authorization
- [ ] Run full test suite

**See:** [MIGRATION_GUIDES/v1.1-to-v1.2.md](MIGRATION_GUIDES/v1.1-to-v1.2.md)

#### 2. Session Service API Changes
**Impact**: MEDIUM - If using session management

**What Changed:**
- `SessionsService.getSessionById()` now uses `bypassCache: true`
- Session response now includes computed `revokedAt` property

**Code Changes:**
```typescript
// BEFORE
const session = await sessionsService.getSessionById(sessionId)
if (session.metadata?.revokedAt) { ... }

// AFTER  
const session = await sessionsService.getSessionById(sessionId)
if (session.revokedAt) { ... }  // Direct property access
```

### 🔄 Changed Files

**Core Modules:**
- `src/modules/users/entities/user.entity.ts` - Added primaryRoleId, removed role
- `src/modules/acl/guards/super-admin.guard.ts` - NEW FILE
- `src/modules/acl/guards/role-hierarchy.guard.ts` - NEW FILE
- `src/modules/auth/services/sessions.service.ts` - Added revokedAt normalization

**Database:**
- New migration: `1699800000000-AddPrimaryRoleIdToUser.ts`
- `src/core/database/repositories/session.repository.ts` - Query filtering updates

**Tests:**
- `test/factories/user.factory.ts` - Updated for primaryRoleId
- `test/unit/acl/guards/super-admin.guard.spec.ts` - NEW FILE (7 tests)
- `test/unit/acl/guards/role-hierarchy.guard.spec.ts` - NEW FILE (12 tests)
- `test/unit/users/user.entity.spec.ts` - NEW FILE (40 tests)
- `test/integration/auth/session-management.integration.spec.ts` - NEW FILE (16 tests)

**Configuration:**
- No environment variable changes
- No breaking configuration changes

### ✨ Added

- 64 new unit tests for RBAC functionality
- 16 new E2E tests for session management
- Comprehensive JSDoc documentation
- Debug logging for session revocation
- Migration guides and scripts

### 🐛 Fixed

- Session revocation now properly updates `deletedAt` and `isActive`
- Date normalization in session responses
- UserFactory compatibility with new role system

### 📝 Documentation

- [RBAC System Guide](docs/features/acl/README.md)
- [Session Management API](docs/features/auth/SESSION_MANAGEMENT.md)
- [Migration Guide v1.1 → v1.2](MIGRATION_GUIDES/v1.1-to-v1.2.md)

### 🔒 Security

- Enhanced role-based access control
- Super-admin can now revoke any user's sessions
- Improved session security with risk assessment

---

## [1.1.0] - 2025-10-15

### Added
- Audit logging system
- Request ID tracking
- Pino structured logging

### Changed
- Improved error handling
- Enhanced caching strategy

---

## [1.0.0] - 2025-09-01

Initial release of Kuybi backend framework.
```

#### Migration Guide Example

```markdown
# Migration Guide: v1.1 → v1.2

## Overview
This guide walks you through upgrading from Kuybi v1.1 to v1.2, which introduces the RBAC system and changes how user roles are handled.

## Pre-Migration Checklist

- [ ] Backup your database
- [ ] Review breaking changes in CHANGELOG.md
- [ ] Ensure you're on Kuybi v1.1 (check package.json or git tag)
- [ ] Run all tests to ensure current state is working
- [ ] Coordinate with team (schedule downtime if needed)

## Step 1: Database Migration

### Option A: Automated Script
```bash
# Run the migration script
./MIGRATION_GUIDES/scripts/migrate-1.1-1.2.sh

# Verify migration
npm run migration:show
```

### Option B: Manual Migration
```sql
-- 1. Create roles table (if not exists)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  priority INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Insert default roles
INSERT INTO roles (name, priority, description) VALUES
  ('super-admin', 100, 'Super Administrator'),
  ('admin', 80, 'Administrator'),
  ('moderator', 60, 'Moderator'),
  ('user', 40, 'Regular User'),
  ('guest', 20, 'Guest User');

-- 3. Add primaryRoleId to users
ALTER TABLE users ADD COLUMN primary_role_id UUID;

-- 4. Migrate existing role data
UPDATE users SET primary_role_id = (
  SELECT id FROM roles WHERE name = users.role
);

-- 5. Make primaryRoleId NOT NULL
ALTER TABLE users ALTER COLUMN primary_role_id SET NOT NULL;

-- 6. Add foreign key constraint
ALTER TABLE users 
  ADD CONSTRAINT fk_user_primary_role 
  FOREIGN KEY (primary_role_id) 
  REFERENCES roles(id);

-- 7. Drop old role column
ALTER TABLE users DROP COLUMN role;
```

## Step 2: Update Dependencies

```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Run migrations
npm run migration:run
```

## Step 3: Update Code

### A. Update User Factory (if using)

**Before:**
```typescript
// test/factories/user.factory.ts
static create(overrides = {}) {
  return {
    email: overrides.email || 'test@example.com',
    role: overrides.role || 'user',  // ❌ Old way
    ...overrides
  }
}
```

**After:**
```typescript
// test/factories/user.factory.ts
static create(overrides = {}) {
  return {
    email: overrides.email || 'test@example.com',
    primaryRoleId: overrides.primaryRoleId || 4,  // ✅ New way (4 = user role)
    ...overrides
  }
}
```

### B. Update Test Files

Find all test files that create users:
```bash
# Find files that need updating
grep -r "role: '" test/

# Common patterns to update:
# role: 'admin' → primaryRoleId: 1
# role: 'user' → primaryRoleId: 4
```

**Example Test Update:**
```typescript
// BEFORE
it('should create admin user', async () => {
  const user = await factory.create({
    role: 'admin'
  })
})

// AFTER
it('should create admin user', async () => {
  const user = await factory.create({
    primaryRoleId: 1  // admin role
  })
})
```

### C. Update User Creation in Services

```typescript
// BEFORE
await userRepository.save({
  email: 'test@example.com',
  role: 'admin',
  ...
})

// AFTER
// First, get the role ID
const adminRole = await roleRepository.findOne({ where: { name: 'admin' } })

await userRepository.save({
  email: 'test@example.com',
  primaryRoleId: adminRole.id,
  ...
})
```

## Step 4: Update Guards

If you have custom guards checking roles:

**Before:**
```typescript
if (user.role === 'admin') {
  // Allow access
}
```

**After:**
```typescript
// Use the new User entity methods
if (user.isSuperAdmin()) {
  // Super admin access
}

// Or check role hierarchy
if (user.canManageUser(targetUser)) {
  // Allow management
}
```

## Step 5: Run Tests

```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run full test suite
npm test
```

## Step 6: Manual Verification

1. **Test Authentication:**
   ```bash
   curl -X POST http://localhost:4000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"Admin@123"}'
   ```

2. **Test Role-Based Access:**
   - Try accessing super-admin only endpoints
   - Verify role hierarchy works
   - Check permission system

3. **Test Session Management:**
   ```bash
   # List sessions
   GET /api/v1/sessions/me
   
   # Super-admin list any user
   GET /api/v1/sessions/users/:userId
   ```

## Rollback Procedure

If issues arise:

```bash
# 1. Revert database migration
npm run migration:revert

# 2. Checkout previous version
git checkout v1.1.0

# 3. Reinstall dependencies
npm install

# 4. Restart services
npm run start
```

## Common Issues

### Issue 1: "Column 'role' does not exist"
**Cause:** Code still using old `role` column  
**Solution:** Search for `user.role` in your codebase and update to use `primaryRoleId`

### Issue 2: Tests failing with "primaryRoleId cannot be null"
**Cause:** Tests creating users without primaryRoleId  
**Solution:** Update test factories and fixtures

### Issue 3: "Foreign key violation on users.primary_role_id"
**Cause:** Trying to set invalid role ID  
**Solution:** Ensure role exists in roles table before assigning

## Need Help?

- Slack: #kuybi-support
- Email: devops@company.com
- GitHub Issues: https://github.com/company/kuybi/issues
```

#### Automated Migration Script

```bash
#!/bin/bash
# MIGRATION_GUIDES/scripts/migrate-1.1-1.2.sh

set -e  # Exit on error

echo "🚀 Kuybi Migration: v1.1 → v1.2 (RBAC System)"
echo "================================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo ""
echo "📋 Checking prerequisites..."

# Check if database is accessible
if ! npm run migration:show &> /dev/null; then
  echo -e "${RED}❌ Database connection failed${NC}"
  echo "Please check your database configuration"
  exit 1
fi

# Backup reminder
echo ""
echo -e "${YELLOW}⚠️  Important: Have you backed up your database? (y/n)${NC}"
read -r backup_confirm
if [[ ! $backup_confirm =~ ^[Yy]$ ]]; then
  echo -e "${RED}❌ Migration cancelled. Please backup your database first.${NC}"
  exit 1
fi

# Run migration
echo ""
echo "🔄 Running database migration..."
npm run migration:run

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Database migration completed${NC}"
else
  echo -e "${RED}❌ Database migration failed${NC}"
  exit 1
fi

# Update code
echo ""
echo "🔄 Checking for code updates..."

# Find files that need updating
files_with_role=$(grep -r "role: '" test/ src/ 2>/dev/null | wc -l)

if [ "$files_with_role" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Found $files_with_role files that may need updating${NC}"
  echo "Run this to see them:"
  echo "  grep -r \"role: '\" test/ src/"
  echo ""
  echo "Update pattern:"
  echo "  role: 'admin' → primaryRoleId: 1"
  echo "  role: 'user' → primaryRoleId: 4"
fi

# Run tests
echo ""
echo "🧪 Running tests..."
npm test

if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✅ All tests passed!${NC}"
  echo ""
  echo "🎉 Migration completed successfully!"
  echo ""
  echo "Next steps:"
  echo "1. Review changed files: git diff"
  echo "2. Update any custom code using 'role' property"
  echo "3. Deploy to staging for verification"
  echo "4. Review CHANGELOG.md for all changes"
else
  echo ""
  echo -e "${RED}❌ Some tests failed${NC}"
  echo "Please review test output and fix issues"
  echo "See MIGRATION_GUIDES/v1.1-to-v1.2.md for troubleshooting"
  exit 1
fi
```

#### Automatic Changelog Generation

**Using Conventional Commits:**
```json
// package.json
{
  "scripts": {
    "changelog": "conventional-changelog -p angular -i CHANGELOG.md -s",
    "version": "npm run changelog && git add CHANGELOG.md",
    "release": "standard-version",
    "release:minor": "standard-version --release-as minor",
    "release:major": "standard-version --release-as major",
    "release:patch": "standard-version --release-as patch"
  },
  "devDependencies": {
    "conventional-changelog-cli": "^2.2.2",
    "standard-version": "^9.5.0"
  }
}
```

**Commit Message Format:**
```bash
# Features
git commit -m "feat(auth): add RBAC system with role hierarchy"

# Bug fixes
git commit -m "fix(sessions): correct revokedAt property handling"

# Breaking changes
git commit -m "feat(users)!: replace role column with primaryRoleId

BREAKING CHANGE: User entity now uses primaryRoleId instead of role.
Teams must run migration script and update code."

# Then generate changelog
npm run release
```

#### Benefits
✅ Quick to implement (1-2 days)  
✅ Minimal infrastructure changes  
✅ Clear communication of changes  
✅ Works with current workflow  
✅ Automated migration assistance  
✅ Good for gradual improvements  

#### Challenges
⚠️ Still requires manual file updates  
⚠️ Teams must follow documentation  
⚠️ No automated dependency management  
⚠️ Can miss edge cases  

#### Best For
- **Immediate solution** while planning long-term strategy
- Small number of teams (2-4)
- Infrequent updates
- Transitioning to better solution

---

### Strategy 4: Monorepo Architecture

#### Overview
Use monorepo tools (Nx, Turborepo, Lerna) to manage multiple services in one repository.

#### Structure with Nx
```
company-backend/
├── apps/
│   ├── service-a/        # Team A's microservice
│   ├── service-b/        # Team B's microservice
│   └── service-c/        # Team C's microservice
├── libs/
│   ├── kuybi-core/       # Shared authentication, ACL
│   ├── kuybi-database/   # Shared database utilities
│   ├── kuybi-logging/    # Shared logging
│   └── shared-types/     # Shared TypeScript types
├── nx.json
├── package.json
└── tsconfig.base.json
```

#### Setup with Nx

```bash
# Install Nx
npx create-nx-workspace@latest company-backend --preset=nest

# Create shared library
nx g @nrwl/nest:library kuybi-core

# Create service
nx g @nrwl/nest:application service-a

# Structure
company-backend/
├── libs/kuybi-core/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── auth/
│   │   │   ├── acl/
│   │   │   └── users/
│   │   └── index.ts
│   └── project.json
```

**Import Shared Code:**
```typescript
// apps/service-a/src/app/app.module.ts
import { AuthModule, AclModule } from '@company/kuybi-core'

@Module({
  imports: [AuthModule, AclModule, CustomModule]
})
export class AppModule {}
```

**Build and Test:**
```bash
# Build specific app
nx build service-a

# Test everything affected by changes
nx affected:test

# Build everything
nx run-many --target=build --all

# Dependency graph
nx graph
```

#### Setup with Turborepo

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    }
  }
}
```

```bash
# Install
npm install turbo --save-dev

# Run commands
turbo run build          # Build all packages
turbo run test --filter=service-a  # Test specific service
```

#### Benefits
✅ Single source of truth  
✅ Shared code changes propagate automatically  
✅ Coordinated testing across all services  
✅ Better dependency management  
✅ Faster builds with caching  
✅ Visualize dependencies  
✅ Atomic commits across services  

#### Challenges
⚠️ Significant setup time  
⚠️ Requires organizational buy-in  
⚠️ CI/CD restructuring needed  
⚠️ Learning curve for teams  
⚠️ Large repository size  
⚠️ Need consistent Node.js versions  

#### Best For
- 5+ teams using shared code
- Want coordinated releases
- Need unified testing/deployment
- Have DevOps resources
- Long-term investment

---

### Strategy 5: Fork + Upstream Sync

#### Overview
Teams fork Kuybi repository and periodically sync with upstream.

#### Setup

**Initial Fork:**
```bash
# Team forks on GitHub, then clones
git clone https://github.com/team-a/their-service.git
cd their-service

# Add upstream remote
git remote add upstream https://github.com/company/kuybi.git
git remote -v
# origin    https://github.com/team-a/their-service.git (fetch)
# origin    https://github.com/team-a/their-service.git (push)
# upstream  https://github.com/company/kuybi.git (fetch)
# upstream  https://github.com/company/kuybi.git (push)
```

**Sync Updates:**
```bash
# Fetch upstream changes
git fetch upstream

# View what's new
git log HEAD..upstream/main --oneline

# Merge upstream changes
git checkout main
git merge upstream/main

# Resolve conflicts if any
# Then push to team's origin
git push origin main
```

**With Tags:**
```bash
# Fetch tags
git fetch upstream --tags

# Checkout specific version
git merge v1.2.0

# Or cherry-pick specific commits
git cherry-pick <commit-hash>
```

#### Communication System

**Use GitHub Releases:**
```markdown
## Release v1.2.0 - RBAC System

### 🎉 What's New
- Role-based access control
- Session management enhancements

### ⚠️ Breaking Changes
- User entity: `role` → `primaryRoleId`
- See migration guide: [LINK]

### 📦 How to Update
```bash
git fetch upstream --tags
git merge v1.2.0
```

### 🔗 Resources
- Changelog: [LINK]
- Migration Guide: [LINK]
- Slack Discussion: #kuybi-v1-2-0
```

#### Conflict Resolution

**Create conflict resolution guide:**
```markdown
# Common Merge Conflicts

## Conflict in package.json
```json
<<<<<<< HEAD
"kuybi-custom-lib": "^2.0.0"
=======
"@nestjs/common": "^10.2.0"
>>>>>>> upstream/main
```

**Resolution:** Keep both dependencies
```json
"kuybi-custom-lib": "^2.0.0",
"@nestjs/common": "^10.2.0"
```

## Conflict in app.module.ts
**Strategy:** Merge both import lists and module arrays
```

#### Benefits
✅ Simple Git workflow  
✅ Teams have full autonomy  
✅ Can diverge if needed  
✅ Easy to contribute back  
✅ No infrastructure needed  

#### Challenges
⚠️ Merge conflicts can be complex  
⚠️ Divergence over time  
⚠️ Requires Git expertise  
⚠️ Manual conflict resolution  
⚠️ Hard to enforce updates  

#### Best For
- Independent teams
- Teams with Git expertise
- Need to customize heavily
- Don't want infrastructure overhead

---

## 🎯 Recommended Implementation Plan

### Phase 1: Immediate (Week 1-2) 
**Implement Strategy 3: Changelog + Migration**

**Week 1:**
- [ ] Create comprehensive CHANGELOG.md for RBAC release
- [ ] Write MIGRATION_GUIDES/v1.1-to-v1.2.md
- [ ] Create migration script `migrate-1.1-1.2.sh`
- [ ] Document all breaking changes
- [ ] Set up GitHub Releases
- [ ] Create Slack/Teams announcement template

**Week 2:**
- [ ] Test migration script with one team
- [ ] Gather feedback and improve
- [ ] Roll out to all teams
- [ ] Set up changelog automation
- [ ] Create update notification system

### Phase 2: Medium Term (Month 2-3)
**Transition to Strategy 1: NPM Package**

**Month 2:**
- [ ] Design package structure and public API
- [ ] Extract core modules to separate package
- [ ] Set up private npm registry (choose: npm/GitHub/Verdaccio)
- [ ] Create initial version @company/kuybi-core@1.0.0
- [ ] Write package documentation

**Month 3:**
- [ ] Pilot with one team
- [ ] Refine based on feedback
- [ ] Create migration guide from current to npm
- [ ] Gradual rollout to all teams
- [ ] Deprecate old approach

### Phase 3: Long Term (Month 4-6)
**Evaluate Strategy 4: Monorepo** (if needed)

**When to Consider:**
- Company has 5+ services using Kuybi
- Need coordinated releases
- Want unified CI/CD
- Have DevOps resources

**Evaluation Criteria:**
- [ ] Number of services using Kuybi
- [ ] Frequency of updates
- [ ] Inter-service dependencies
- [ ] Team comfort with monorepo tools
- [ ] Available DevOps support

---

## 📊 Comparison Matrix

| Strategy | Setup Time | Maintenance | Learning Curve | Infrastructure | Best For |
|----------|-----------|-------------|----------------|----------------|----------|
| **NPM Package** | Medium (2 weeks) | Low | Low | Medium (registry) | 3+ teams, standard workflow |
| **Git Subtree** | Low (1 day) | Medium | Medium | None | 2-3 teams, Git-comfortable |
| **Changelog + Scripts** | Low (2 days) | Medium | Low | None | Immediate fix, small teams |
| **Monorepo** | High (4 weeks) | Low | High | High | 5+ teams, coordinated releases |
| **Fork + Upstream** | Low (1 day) | High | Medium | None | Independent teams |

---

## 🔧 Implementation Checklist

### For Strategy 1 (NPM Package) - Recommended

**Preparation:**
- [ ] Audit current codebase for public API
- [ ] Identify breaking changes in next release
- [ ] Choose npm registry solution
- [ ] Design versioning strategy
- [ ] Plan backward compatibility approach

**Package Creation:**
- [ ] Create @company/kuybi-core package
- [ ] Set up build pipeline (TypeScript compilation)
- [ ] Configure package.json with correct exports
- [ ] Set up automated publishing (CI/CD)
- [ ] Create package documentation

**Team Migration:**
- [ ] Create migration guide
- [ ] Pilot with one team
- [ ] Gather feedback
- [ ] Refine package API
- [ ] Roll out to all teams
- [ ] Deprecate old approach

**Ongoing:**
- [ ] Establish release cadence (weekly/bi-weekly)
- [ ] Set up automated changelog
- [ ] Create deprecation policy
- [ ] Monitor package adoption
- [ ] Provide support channel

### For Strategy 3 (Immediate Fix)

**Week 1:**
- [ ] Document RBAC changes in CHANGELOG.md
- [ ] Create migration guide
- [ ] Write migration scripts
- [ ] Test scripts with sample project
- [ ] Create announcement template

**Week 2:**
- [ ] Announce release in Slack/Teams
- [ ] Create GitHub Release with notes
- [ ] Support teams during migration
- [ ] Collect feedback
- [ ] Improve documentation based on feedback

---

## 📢 Communication Plan

### Update Announcement Template

```markdown
# 📢 Kuybi Update Available: v1.2.0 (RBAC System)

## 🎯 Priority: HIGH - Breaking Changes

## What's New
- Role-based access control with hierarchy
- Enhanced session management
- 80 new tests for RBAC functionality

## ⚠️ Breaking Changes
1. **User Entity Migration Required**
   - Changed: `role` (string) → `primaryRoleId` (UUID)
   - Impact: All user creation code
   - Effort: 2-4 hours

2. **Session API Changes**
   - New super-admin endpoints
   - Response structure updates

## 📝 How to Update

### Step 1: Review Changes
- Changelog: [LINK]
- Migration Guide: [LINK]
- Release Notes: [LINK]

### Step 2: Run Migration
```bash
git pull origin main
./MIGRATION_GUIDES/scripts/migrate-1.1-1.2.sh
```

### Step 3: Update Code
- Update UserFactory: [GUIDE]
- Update tests: [GUIDE]
- Run: `npm test`

## 🆘 Support
- Slack: #kuybi-support
- Office Hours: Thursday 2-4pm
- 1:1 Help: Book time [LINK]

## ⏰ Timeline
- Release Date: November 12, 2025
- Recommended Update By: November 19, 2025
- Support Until: December 12, 2025

## 🙋 Questions?
Reply in thread or DM @devops-team
```

### Regular Update Cadence

**Weekly:**
- Monday: Release planning
- Friday: Release notes published
- Friday: Slack announcement

**Monthly:**
- First Monday: Monthly roadmap
- Third Thursday: Office hours for Q&A
- Last Friday: Month-in-review

---

## 🎓 Team Training Plan

### Week 1: Introduction
- Overview of chosen strategy
- Benefits and workflow
- Q&A session

### Week 2: Hands-on Workshop
- Live migration demo
- Practice with sample project
- Troubleshooting common issues

### Week 3: Team-specific Support
- 1:1 sessions with each team
- Answer specific questions
- Help with first migration

### Week 4: Follow-up
- Gather feedback
- Improve documentation
- Refine process

---

## 📈 Success Metrics

Track these to measure effectiveness:

- **Update Adoption Rate**: % of teams on latest version
- **Time to Update**: Average hours to migrate
- **Breaking Changes**: Number per release (target: minimize)
- **Support Tickets**: Number related to updates
- **Team Satisfaction**: Survey after updates

**Quarterly Review:**
- Are teams updating regularly?
- Are breaking changes decreasing?
- Is documentation helpful?
- Should we change strategy?

---

## 🚨 Rollback Strategy

For each approach, have a rollback plan:

### NPM Package Rollback
```bash
# Downgrade package
npm install @company/kuybi-core@1.1.0

# Or pin in package.json
"@company/kuybi-core": "1.1.0"
```

### Git-based Rollback
```bash
# Revert merge
git revert -m 1 <merge-commit>

# Or reset to previous state
git reset --hard <previous-commit>
```

### Database Rollback
```bash
# Revert migration
npm run migration:revert
```

---

## 📚 Additional Resources

### Tools
- **Conventional Changelog**: Auto-generate changelogs
- **Semantic Release**: Automated versioning
- **Verdaccio**: Self-hosted npm registry
- **Nx**: Monorepo tool
- **Lerna**: Multi-package management

### Documentation Templates
- CHANGELOG.md format
- Migration guide template
- Release notes template
- Breaking change announcement

### Best Practices
- Semantic versioning guide
- Deprecation policy
- Backward compatibility guidelines
- Release checklist

---

## 🤝 Getting Started

**Next Steps:**

1. **This Week:**
   - Review this document with leadership
   - Choose preferred strategy
   - Schedule team meeting
   - Assign ownership

2. **Next Week:**
   - Create implementation plan
   - Set up infrastructure (if needed)
   - Begin documentation
   - Pilot with one team

3. **Month 1:**
   - Roll out to all teams
   - Gather feedback
   - Refine process
   - Document lessons learned

---

## 💬 Questions for Discussion

Before implementing, answer these:

1. How many teams/services use Kuybi?
2. How often do you release updates?
3. What's the team's Git/npm expertise level?
4. Do you have DevOps resources available?
5. Is there budget for paid tools?
6. How much control do teams need over their code?
7. What's the tolerance for breaking changes?

---

## 📞 Support & Feedback

- **Document Owner**: DevOps Team
- **Last Updated**: November 12, 2025
- **Next Review**: December 12, 2025
- **Feedback**: Share in #kuybi-strategy or devops@company.com

---

*This is a living document. Please contribute improvements!*
