# ACL System Testing Guide

## Overview

This guide provides comprehensive end-to-end testing procedures for the ACL (Access Control List) system implementation.

## Prerequisites

Before testing, ensure:

1. **Database migrations are run**
   ```bash
   cd nest-app
   npm run migration:run
   ```

2. **ACL seeder is executed**
   ```bash
   npm run db:seed:acl
   ```

3. **Application is running**
   ```bash
   npm start
   ```

4. **You have test users with different roles**

## Testing Checklist

### ✅ Phase 1: Database Setup

- [ ] **Migration Verification**
  ```sql
  -- Check tables exist
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('roles', 'permissions', 'role_permissions', 'user_roles');
  
  -- Check ENUM types exist
  SELECT typname FROM pg_type 
  WHERE typname IN ('permission_action_enum', 'permission_subject_enum');
  ```

- [ ] **Seed Data Verification**
  ```sql
  -- Check roles (should have 5)
  SELECT id, name, priority, is_system, is_active FROM roles ORDER BY priority DESC;
  
  -- Check permissions (should have 50+)
  SELECT COUNT(*) FROM permissions;
  
  -- Check role-permission assignments
  SELECT r.name, COUNT(rp.id) as permission_count
  FROM roles r
  LEFT JOIN role_permissions rp ON r.id = rp.role_id
  GROUP BY r.id, r.name
  ORDER BY r.priority DESC;
  ```

### ✅ Phase 2: Role CRUD Operations

#### Test 1: Create Role
```bash
# Request
POST /api/v1/roles
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "name": "editor",
  "description": "Content editor role",
  "priority": 60,
  "isActive": true
}

# Expected Response (201 Created)
{
  "id": 6,
  "name": "editor",
  "description": "Content editor role",
  "priority": 60,
  "isActive": true,
  "isSystem": false,
  "createdAt": "2025-10-25T10:00:00Z",
  "updatedAt": "2025-10-25T10:00:00Z"
}
```

**Validations:**
- [ ] Returns 201 Created on success
- [ ] Returns 400 if role name already exists
- [ ] Returns 401 if not authenticated
- [ ] Returns 403 if user lacks `create:Role` permission

#### Test 2: List All Roles
```bash
# Request
GET /api/v1/roles
Authorization: Bearer {admin_token}

# Expected Response (200 OK)
[
  { "id": 1, "name": "super-admin", "priority": 100, ... },
  { "id": 2, "name": "admin", "priority": 90, ... },
  { "id": 3, "name": "moderator", "priority": 70, ... },
  ...
]
```

**Validations:**
- [ ] Returns all roles sorted by priority DESC
- [ ] Includes soft-deleted roles with deletedAt != null
- [ ] Returns 403 if user lacks `read:Role` permission

#### Test 3: List Active Roles
```bash
# Request
GET /api/v1/roles/active
Authorization: Bearer {admin_token}

# Expected Response (200 OK)
[
  { "id": 1, "name": "super-admin", "isActive": true, ... },
  { "id": 2, "name": "admin", "isActive": true, ... },
  ...
]
```

**Validations:**
- [ ] Returns only active roles (isActive=true)
- [ ] Excludes soft-deleted roles
- [ ] Sorted by priority DESC, then name ASC

#### Test 4: Get Role by ID
```bash
# Request
GET /api/v1/roles/1
Authorization: Bearer {admin_token}

# Expected Response (200 OK)
{
  "id": 1,
  "name": "super-admin",
  "priority": 100,
  ...
}
```

**Validations:**
- [ ] Returns role details
- [ ] Returns 404 if role not found
- [ ] Returns 403 if user lacks `read:Role` permission

#### Test 5: Update Role
```bash
# Request
PUT /api/v1/roles/6
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "description": "Updated content editor role",
  "priority": 65
}

# Expected Response (200 OK)
{
  "id": 6,
  "name": "editor",
  "description": "Updated content editor role",
  "priority": 65,
  ...
}
```

**Validations:**
- [ ] Updates allowed fields
- [ ] Returns 400 if trying to rename system role
- [ ] Returns 400 if trying to change isSystem flag on system role
- [ ] Returns 404 if role not found
- [ ] Returns 403 if user lacks `update:Role` permission

#### Test 6: Delete Role (Soft Delete)
```bash
# Request
DELETE /api/v1/roles/6
Authorization: Bearer {admin_token}

# Expected Response (204 No Content)
```

**Validations:**
- [ ] Soft deletes role (sets deletedAt)
- [ ] Returns 400 if trying to delete system role
- [ ] Returns 404 if role not found
- [ ] Returns 403 if user lacks `delete:Role` permission

### ✅ Phase 3: Permission CRUD Operations

#### Test 7: Create Permission
```bash
# Request
POST /api/v1/permissions
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "action": "update",
  "subject": "Tag",
  "conditions": { "userId": "${userId}" },
  "reason": "Users can update their own tags"
}

# Expected Response (201 Created)
{
  "id": 51,
  "action": "update",
  "subject": "Tag",
  "conditions": { "userId": "${userId}" },
  "fields": [],
  "inverted": false,
  "reason": "Users can update their own tags",
  ...
}
```

**Validations:**
- [ ] Creates permission successfully
- [ ] Returns 400 if action-subject pair already exists
- [ ] Returns 401 if not authenticated
- [ ] Returns 403 if user lacks `create:Permission` permission

#### Test 8: List All Permissions
```bash
# Request
GET /api/v1/permissions
Authorization: Bearer {admin_token}

# Expected Response (200 OK)
[
  { "id": 1, "action": "manage", "subject": "all", ... },
  { "id": 2, "action": "create", "subject": "User", ... },
  ...
]
```

**Validations:**
- [ ] Returns all permissions
- [ ] Returns 403 if user lacks `read:Permission` permission

#### Test 9: Filter Permissions by Action
```bash
# Request
GET /api/v1/permissions?action=create
Authorization: Bearer {admin_token}

# Expected Response (200 OK)
[
  { "id": 2, "action": "create", "subject": "User", ... },
  { "id": 5, "action": "create", "subject": "Story", ... },
  ...
]
```

**Validations:**
- [ ] Returns only permissions with specified action
- [ ] Returns empty array if no matches

#### Test 10: Filter Permissions by Subject
```bash
# Request
GET /api/v1/permissions?subject=Story
Authorization: Bearer {admin_token}

# Expected Response (200 OK)
[
  { "id": 5, "action": "create", "subject": "Story", ... },
  { "id": 6, "action": "read", "subject": "Story", ... },
  ...
]
```

**Validations:**
- [ ] Returns only permissions with specified subject
- [ ] Returns empty array if no matches

#### Test 11: Filter Permissions by Action and Subject
```bash
# Request
GET /api/v1/permissions?action=update&subject=Story
Authorization: Bearer {admin_token}

# Expected Response (200 OK)
{
  "id": 7,
  "action": "update",
  "subject": "Story",
  ...
}
```

**Validations:**
- [ ] Returns single permission matching both filters
- [ ] Returns null if no match

#### Test 12: Update Permission
```bash
# Request
PUT /api/v1/permissions/51
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "reason": "Updated: Users can update tags they created"
}

# Expected Response (200 OK)
{
  "id": 51,
  "action": "update",
  "subject": "Tag",
  "reason": "Updated: Users can update tags they created",
  ...
}
```

**Validations:**
- [ ] Updates specified fields
- [ ] Returns 400 if new action-subject pair conflicts
- [ ] Returns 404 if permission not found
- [ ] Returns 403 if user lacks `update:Permission` permission

#### Test 13: Delete Permission
```bash
# Request
DELETE /api/v1/permissions/51
Authorization: Bearer {admin_token}

# Expected Response (204 No Content)
```

**Validations:**
- [ ] Hard deletes permission (permanent)
- [ ] Cascades to role_permissions table
- [ ] Returns 404 if permission not found
- [ ] Returns 403 if user lacks `delete:Permission` permission

### ✅ Phase 4: Role-Permission Assignment

#### Test 14: Assign Permissions to Role
```bash
# Request
POST /api/v1/roles/6/permissions
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "permissionIds": [5, 6, 7, 8, 9]  // Story permissions (create, read, update, delete, publish)
}

# Expected Response (200 OK)
{
  "id": 6,
  "name": "editor",
  "rolePermissions": [
    { "permission": { "id": 5, "action": "create", "subject": "Story" } },
    { "permission": { "id": 6, "action": "read", "subject": "Story" } },
    { "permission": { "id": 7, "action": "update", "subject": "Story" } },
    { "permission": { "id": 8, "action": "delete", "subject": "Story" } },
    { "permission": { "id": 9, "action": "publish", "subject": "Story" } }
  ],
  ...
}
```

**Validations:**
- [ ] Assigns all specified permissions
- [ ] Returns 400 if any permission ID is invalid
- [ ] Returns 404 if role not found
- [ ] Returns 403 if user lacks `update:Role` permission
- [ ] Duplicate assignments are idempotent (no error)

#### Test 15: Get Role Permissions
```bash
# Request
GET /api/v1/roles/6/permissions
Authorization: Bearer {admin_token}

# Expected Response (200 OK)
[
  { "id": 5, "action": "create", "subject": "Story", ... },
  { "id": 6, "action": "read", "subject": "Story", ... },
  { "id": 7, "action": "update", "subject": "Story", ... },
  { "id": 8, "action": "delete", "subject": "Story", ... },
  { "id": 9, "action": "publish", "subject": "Story", ... }
]
```

**Validations:**
- [ ] Returns all permissions for the role
- [ ] Returns empty array if role has no permissions
- [ ] Returns 404 if role not found
- [ ] Returns 403 if user lacks `read:Role` permission

#### Test 16: Remove Permissions from Role
```bash
# Request
DELETE /api/v1/roles/6/permissions
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "permissionIds": [9]  // Remove publish permission
}

# Expected Response (200 OK)
{
  "id": 6,
  "name": "editor",
  "rolePermissions": [
    { "permission": { "id": 5, "action": "create", "subject": "Story" } },
    { "permission": { "id": 6, "action": "read", "subject": "Story" } },
    { "permission": { "id": 7, "action": "update", "subject": "Story" } },
    { "permission": { "id": 8, "action": "delete", "subject": "Story" } }
  ],
  ...
}
```

**Validations:**
- [ ] Removes specified permissions
- [ ] Returns 400 if trying to remove all permissions from system role
- [ ] Returns 404 if role not found
- [ ] Returns 403 if user lacks `update:Role` permission
- [ ] Removing non-existent permissions is idempotent (no error)

### ✅ Phase 5: Guard Enforcement

#### Test 17: Unauthenticated Access (Guest)
```bash
# Request (no Authorization header)
POST /api/v1/roles
Content-Type: application/json

{
  "name": "test-role"
}

# Expected Response (401 Unauthorized)
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Validations:**
- [ ] Returns 401 for all protected endpoints
- [ ] Does NOT return 403 (permission check should not run without auth)

#### Test 18: Insufficient Permissions
```bash
# Request (user without create:Role permission)
POST /api/v1/roles
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "name": "test-role"
}

# Expected Response (403 Forbidden)
{
  "statusCode": 403,
  "message": "Insufficient permissions. Required: create Role"
}
```

**Validations:**
- [ ] Returns 403 Forbidden
- [ ] Error message includes required permission
- [ ] Does NOT reveal implementation details

#### Test 19: Multiple Permission Requirements (OR Logic)
```bash
# Endpoint with @CheckAbility({ action: 'update', subject: 'Story' }, { action: 'manage', subject: 'all' })

# Request (user with manage:all permission)
PUT /api/v1/stories/123
Authorization: Bearer {admin_token}

# Expected: Success (has manage:all)

# Request (user with update:Story permission)
PUT /api/v1/stories/123
Authorization: Bearer {moderator_token}

# Expected: Success (has update:Story)

# Request (user with neither permission)
PUT /api/v1/stories/123
Authorization: Bearer {user_token}

# Expected: 403 Forbidden
```

**Validations:**
- [ ] Access granted if user has ANY of the required permissions
- [ ] Access denied only if user has NONE of the required permissions

### ✅ Phase 6: Ownership Checks (${userId} Conditions)

#### Test 20: Own Story Update (Allowed)
```bash
# User creates story (userId: user-123)
POST /api/v1/stories
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "title": "My Story",
  "content": "Story content",
  "userId": "user-123"
}

# User updates their own story
PUT /api/v1/stories/{storyId}
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "title": "Updated Story"
}

# Expected Response (200 OK)
```

**Validations:**
- [ ] User can update story where story.userId === user.id
- [ ] Permission has condition: { userId: '${userId}' }
- [ ] AbilityFactory interpolates ${userId} with actual user ID

#### Test 21: Other User's Story Update (Denied)
```bash
# User tries to update someone else's story
PUT /api/v1/stories/{otherUserStoryId}
Authorization: Bearer {user_token}
Content-Type: application/json

{
  "title": "Hacking attempt"
}

# Expected Response (403 Forbidden)
{
  "statusCode": 403,
  "message": "Insufficient permissions. Required: update Story"
}
```

**Validations:**
- [ ] Access denied when story.userId !== user.id
- [ ] CASL condition check fails
- [ ] Returns 403 Forbidden

#### Test 22: Admin Override (Allowed)
```bash
# Admin updates any story (has update:Story without conditions)
PUT /api/v1/stories/{anyStoryId}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "title": "Admin update"
}

# Expected Response (200 OK)
```

**Validations:**
- [ ] Admin can update any story
- [ ] Admin permission has no conditions (unconditional access)
- [ ] Ownership check bypassed for admin

### ✅ Phase 7: Time-based Role Expiration

#### Test 23: Active Role with Future Expiration
```sql
-- Assign role with future expiration
INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at, is_active)
VALUES ('user-123', 4, 'admin-456', '2026-12-31 23:59:59', true);
```

```bash
# User makes request (role still valid)
GET /api/v1/stories
Authorization: Bearer {user_token}

# Expected: Success (role not expired)
```

**Validations:**
- [ ] User has role permissions
- [ ] expiresAt is in the future
- [ ] AbilityFactory includes this role

#### Test 24: Expired Role
```sql
-- Assign role with past expiration
INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at, is_active)
VALUES ('user-123', 4, 'admin-456', '2024-12-31 23:59:59', true);
```

```bash
# User makes request (role expired)
POST /api/v1/stories
Authorization: Bearer {user_token}

# Expected: 403 Forbidden (no create permission)
```

**Validations:**
- [ ] Expired role is excluded from ability checks
- [ ] User loses associated permissions
- [ ] expiresAt is checked in AbilityFactory

#### Test 25: Inactive Role
```sql
-- Deactivate user role
UPDATE user_roles SET is_active = false WHERE user_id = 'user-123' AND role_id = 4;
```

```bash
# User makes request (role inactive)
POST /api/v1/stories
Authorization: Bearer {user_token}

# Expected: 403 Forbidden
```

**Validations:**
- [ ] Inactive roles are excluded from ability checks
- [ ] isActive flag is checked in AbilityFactory

### ✅ Phase 8: Super-admin Bypass

#### Test 26: Super-admin Full Access
```bash
# Super-admin creates role (has manage:all)
POST /api/v1/roles
Authorization: Bearer {superadmin_token}
Content-Type: application/json

{
  "name": "test-role"
}

# Expected Response (201 Created)

# Super-admin updates any story
PUT /api/v1/stories/{anyStoryId}
Authorization: Bearer {superadmin_token}
Content-Type: application/json

{
  "title": "Super-admin update"
}

# Expected Response (200 OK)
```

**Validations:**
- [ ] Super-admin bypasses all permission checks in AbilityGuard
- [ ] Has `manage:all` permission in AbilityFactory
- [ ] Can perform ANY action on ANY subject
- [ ] No database queries for permission checks (instant access)

#### Test 27: Super-admin Bypass Verification
```typescript
// In AbilityGuard.canActivate()
if (user.role === 'super-admin' || user.isSuperAdmin()) {
  return true; // Bypass permission checks
}
```

**Validations:**
- [ ] Check user.role === 'super-admin' (JWT payload)
- [ ] Check user.isSuperAdmin() (User entity method)
- [ ] Return true immediately (no ability check)
- [ ] Log super-admin access (optional for audit)

### ✅ Phase 9: Caching Behavior

#### Test 28: Cache Hit on Repeated Query
```bash
# First request (cache miss)
GET /api/v1/roles/1
Authorization: Bearer {admin_token}

# Check logs: Should see "Cache miss for: role:id:1"

# Second request (cache hit)
GET /api/v1/roles/1
Authorization: Bearer {admin_token}

# Check logs: Should see "Cache hit for: role:id:1"
```

**Validations:**
- [ ] First request queries database
- [ ] Second request returns from cache (faster)
- [ ] Cache TTL is 15 minutes (900 seconds)
- [ ] Response is identical

#### Test 29: Cache Invalidation on Update
```bash
# Get role (cache warm)
GET /api/v1/roles/1
Authorization: Bearer {admin_token}

# Update role (invalidates cache)
PUT /api/v1/roles/1
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "description": "Updated description"
}

# Get role again (cache miss, new data)
GET /api/v1/roles/1
Authorization: Bearer {admin_token}

# Expected: Returns updated data
```

**Validations:**
- [ ] Update operation invalidates all related cache keys
- [ ] Next GET query hits database (not stale cache)
- [ ] Returns fresh data with updated description

### ✅ Phase 10: System Role Protection

#### Test 30: Prevent System Role Deletion
```bash
# Try to delete super-admin role
DELETE /api/v1/roles/1
Authorization: Bearer {superadmin_token}

# Expected Response (400 Bad Request)
{
  "statusCode": 400,
  "message": "Cannot delete system roles"
}
```

**Validations:**
- [ ] Returns 400 Bad Request
- [ ] Error message explains restriction
- [ ] Database record unchanged

#### Test 31: Prevent System Role Name Change
```bash
# Try to rename super-admin role
PUT /api/v1/roles/1
Authorization: Bearer {superadmin_token}
Content-Type: application/json

{
  "name": "hacked-admin"
}

# Expected Response (400 Bad Request)
{
  "statusCode": 400,
  "message": "Cannot change the name of a system role"
}
```

**Validations:**
- [ ] Returns 400 Bad Request
- [ ] Role name unchanged in database

#### Test 32: Prevent Removing All Permissions from System Role
```bash
# Get all permissions for super-admin role
GET /api/v1/roles/1/permissions
Authorization: Bearer {superadmin_token}

# Try to remove the only permission (manage:all)
DELETE /api/v1/roles/1/permissions
Authorization: Bearer {superadmin_token}
Content-Type: application/json

{
  "permissionIds": [1]  // manage:all permission
}

# Expected Response (400 Bad Request)
{
  "statusCode": 400,
  "message": "Cannot remove all permissions from a system role"
}
```

**Validations:**
- [ ] Returns 400 Bad Request
- [ ] Permission assignment unchanged

## Test Results Summary

### Expected Pass Rates

- **Phase 1 (Database)**: 100% (all checks pass)
- **Phase 2 (Roles)**: 100% (6 tests)
- **Phase 3 (Permissions)**: 100% (6 tests)
- **Phase 4 (Assignments)**: 100% (3 tests)
- **Phase 5 (Guards)**: 100% (3 tests)
- **Phase 6 (Ownership)**: 100% (3 tests)
- **Phase 7 (Expiration)**: 100% (3 tests)
- **Phase 8 (Super-admin)**: 100% (2 tests)
- **Phase 9 (Caching)**: 100% (2 tests)
- **Phase 10 (Protection)**: 100% (3 tests)

**Total: 32 tests**

## Automated Testing (Future)

```typescript
// Example E2E test for ACL
describe('ACL System (e2e)', () => {
  describe('Role Management', () => {
    it('should create a new role', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'editor',
          description: 'Content editor role',
          priority: 60,
        })
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.name).toBe('editor')
    })

    it('should deny role creation without permission', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'test' })
        .expect(403)
    })
  })

  describe('Permission Checks', () => {
    it('should allow user to update own story', async () => {
      const story = await createStory(user.id)

      await request(app.getHttpServer())
        .put(`/api/v1/stories/${story.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Updated' })
        .expect(200)
    })

    it('should deny user updating other user story', async () => {
      const story = await createStory(otherUser.id)

      await request(app.getHttpServer())
        .put(`/api/v1/stories/${story.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Hacked' })
        .expect(403)
    })
  })

  describe('Super-admin', () => {
    it('should allow super-admin to access everything', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'test' })
        .expect(201)

      await request(app.getHttpServer())
        .delete('/api/v1/roles/6')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(204)
    })
  })
})
```

## Troubleshooting

### Common Issues

1. **403 Forbidden despite correct role**
   - Check: `user_roles.is_active = true`
   - Check: `user_roles.expires_at > NOW() OR expires_at IS NULL`
   - Check: `roles.is_active = true`
   - Solution: Run `SELECT * FROM user_roles WHERE user_id = '{userId}'`

2. **Permission not found**
   - Check: Permission exists in database
   - Check: Permission is assigned to role
   - Solution: Run seeder again: `npm run db:seed:acl`

3. **Cache stale data**
   - Solution: Clear cache manually
   ```bash
   redis-cli
   > KEYS role:*
   > DEL role:id:1
   ```

4. **Super-admin not bypassing**
   - Check: JWT payload has `role: 'super-admin'`
   - Check: User entity has `isSuperAdmin()` method
   - Solution: Verify user creation/seeding

## Next Steps

After completing this testing guide:

1. **Automate tests**: Convert manual tests to Jest E2E tests
2. **Integration testing**: Test with existing controllers (Stories, Attachments)
3. **Performance testing**: Test with 1000+ users, roles, permissions
4. **Load testing**: Concurrent permission checks
5. **Security audit**: Penetration testing for privilege escalation

## Resources

- [CASL Documentation](https://casl.js.org/)
- [Jest Testing](https://jestjs.io/)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- ACL Implementation: `docs/features/acl/README.md`
- ACL Quick Reference: `docs/features/acl/QUICK_REFERENCE.md`
