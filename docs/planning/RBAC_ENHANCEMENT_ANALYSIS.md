# RBAC Enhancement Analysis & Implementation Plan

**Date**: November 6, 2024  
**Branch**: `feature/rbac-enhancement`  
**Status**: Research & Planning Phase

---

## Executive Summary

Current RBAC implementation has significant weaknesses:

1. **Dual Role Systems**: Legacy `user.role` column (ROLE_USER) coexists with modern CASL-based ACL system (super-admin, admin, moderator, user, guest)
2. **Inconsistent Authorization**: Some endpoints check ACL permissions, others don't
3. **Missing Super Admin Controls**: Critical operations lack super-admin-only restrictions
4. **No Role Hierarchy**: Admin users have excessive permissions, including ability to modify ACL system
5. **Security Gaps**: Session management, audit logs, and password management accessible by non-super-admins

---

## Current State Analysis

### 1. Role Systems

#### Legacy System (User.role column)
```typescript
// src/modules/users/entities/user.entity.ts
@Column({ length: 20, default: 'ROLE_USER' })
role: string  // Default: ROLE_USER, can be: super-admin
```

**Issues**:
- String-based, no validation
- Mixed naming: `ROLE_USER` vs `super-admin`
- Used in JWT payload but inconsistent with ACL
- No relationship to ACL roles table

#### Modern ACL System (CASL + Database)
```typescript
// Roles: super-admin, admin, moderator, user, guest
// Stored in: roles, user_roles, permissions, role_permissions tables
```

**Implementation**:
- Full CASL integration
- Fine-grained permissions with conditions
- Role expiration support
- Priority-based role hierarchy (10-100)

### 2. Authorization Gaps

#### ❌ Unprotected Critical Endpoints

**Admin Password Management** (`src/modules/users/controllers/admin-users.controller.ts`)
```typescript
@Post('admin/users/reset-password')
@CheckAbility({ action: Action.Update, subject: Subject.User })
// ⚠️ ANY user with Update:User can reset ANY password
```

**Session Management** (`src/modules/auth/controllers/sessions.controller.ts`)
```typescript
@Post('v1/sessions/cleanup')
@ApiOperation({ summary: 'Manual cleanup (admin only)' })
// ⚠️ Only checks user.role === 'admin', not CASL permissions
// ⚠️ Should be super-admin only
```

**Audit Logs** (`src/modules/audit/controllers/audit.controller.ts`)
```typescript
@Get('audit/search')
@CheckAbility({ action: Action.Read, subject: Subject.AuditLog })
// ⚠️ Admin role has this permission - should be super-admin only
```

**Role & Permission Management** (`src/modules/acl/controllers/roles.controller.ts`)
```typescript
@Post('v1/roles')
@CheckAbility({ action: Action.Create, subject: Subject.Role })
// ⚠️ Currently open to users with Role permissions
// ⚠️ Should be super-admin only to prevent privilege escalation
```

**User Role Assignment** (`src/modules/users/controllers/user-roles.controller.ts`)
```typescript
@Post('v1/users/:userId/roles')
@CheckAbility({ action: Action.Assign, subject: Subject.Role })
// ⚠️ ANY user with Assign:Role can elevate privileges
// ⚠️ No checks to prevent assigning super-admin role
```

### 3. Current Permission Matrix

| Endpoint | Current Access | Should Be |
|----------|---------------|-----------|
| **ACL Management** |
| `POST /v1/roles` | Create:Role | Super-Admin Only |
| `PUT /v1/roles/:id` | Update:Role | Super-Admin Only |
| `DELETE /v1/roles/:id` | Delete:Role | Super-Admin Only |
| `POST /v1/roles/:id/permissions` | Update:Role | Super-Admin Only |
| `POST /v1/permissions` | Create:Permission | Super-Admin Only |
| `PUT /v1/permissions/:id` | Update:Permission | Super-Admin Only |
| `DELETE /v1/permissions/:id` | Delete:Permission | Super-Admin Only |
| **User Role Assignment** |
| `POST /v1/users/:userId/roles` | Assign:Role | Super-Admin Only |
| `DELETE /v1/users/:userId/roles/:roleId` | Assign:Role | Super-Admin Only |
| **Admin Password Management** |
| `POST /admin/users/reset-password` | Update:User | Super-Admin Only |
| `POST /admin/users/set-password` | Update:User | Super-Admin Only |
| **Session Management** |
| `POST /v1/sessions/cleanup` | Hard-coded admin check | Super-Admin Only |
| **Audit Logs** |
| `GET /audit/search` | Read:AuditLog | Super-Admin Only |
| `GET /audit/statistics` | Read:AuditLog | Super-Admin Only |
| `GET /audit/critical-events` | Read:AuditLog | Super-Admin Only |
| `GET /audit/user/:userId/activity` | Read:AuditLog | Super-Admin Only |

### 4. Security Vulnerabilities

#### 🚨 Critical: Privilege Escalation
```typescript
// Scenario: Admin user can assign themselves super-admin role
// Current implementation has NO check to prevent this

// 1. Admin has Assign:Role permission (from seeder)
// 2. POST /v1/users/{their-own-id}/roles
// 3. Body: { roleId: 1 } // super-admin role
// 4. ✅ Succeeds - Admin is now Super Admin!
```

#### 🚨 Critical: Password Reset Abuse
```typescript
// Scenario: Any user with Update:User can reset super-admin password
// 1. Admin has Update:User permission (no conditions)
// 2. POST /admin/users/reset-password
// 3. Body: { userId: "super-admin-uuid" }
// 4. ✅ Succeeds - Admin can now access super-admin account!
```

#### 🚨 High: Audit Log Tampering
```typescript
// Scenario: Admin can view audit logs and learn attack patterns
// 1. Admin has Read:AuditLog permission
// 2. GET /audit/search?userId={super-admin-id}
// 3. ✅ Succeeds - Admin sees all super-admin actions
```

---

## Proposed Solutions

### Phase 1: Core Role System Standardization

#### 1.1 Deprecate Legacy `user.role` Column

**Migration Strategy**:
```sql
-- Step 1: Add new column for primary role reference
ALTER TABLE users ADD COLUMN primary_role_id INTEGER;
ALTER TABLE users ADD CONSTRAINT fk_users_primary_role 
  FOREIGN KEY (primary_role_id) REFERENCES roles(id);

-- Step 2: Migrate existing data
UPDATE users 
SET primary_role_id = (
  SELECT id FROM roles WHERE name = 'super-admin' LIMIT 1
)
WHERE role = 'super-admin';

UPDATE users 
SET primary_role_id = (
  SELECT id FROM roles WHERE name = 'user' LIMIT 1
)
WHERE role = 'ROLE_USER' OR role IS NULL;

-- Step 3: Ensure all users have user_roles entries
INSERT INTO user_roles (user_id, role_id, is_active, expires_at, created_at, updated_at)
SELECT u.id, u.primary_role_id, true, NULL, NOW(), NOW()
FROM users u
WHERE u.primary_role_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = u.primary_role_id
  );

-- Step 4: (Later) Drop old column
-- ALTER TABLE users DROP COLUMN role;
```

**Code Changes**:
```typescript
// Remove all references to user.role string
// Replace with: user.getPrimaryRole() or user.hasRole()

// Before:
if (user.role === 'super-admin') { }

// After:
if (user.isSuperAdmin()) { }
```

#### 1.2 Introduce Role Hierarchy Enforcement

**Add to Role Entity**:
```typescript
// src/modules/acl/entities/role.entity.ts
@Column({ default: 50 })
priority: number  // Already exists!

// Add method to check hierarchy
canManageRole(targetRole: Role): boolean {
  // Can only manage roles with lower priority
  return this.priority > targetRole.priority
}
```

**Priority Levels** (Already defined in seeder):
- Super Admin: 100
- Admin: 90
- Moderator: 70
- User: 50
- Guest: 10

### Phase 2: Super-Admin-Only Guards

#### 2.1 Create SuperAdminGuard

```typescript
// src/modules/acl/guards/super-admin.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }

    // Check both JWT payload and user entity
    const isSuperAdmin = user.role === 'super-admin' || 
                        (user.isSuperAdmin && user.isSuperAdmin())

    if (!isSuperAdmin) {
      throw new ForbiddenException('Super Admin access required')
    }

    return true
  }
}
```

#### 2.2 Create RoleHierarchyGuard

```typescript
// src/modules/acl/guards/role-hierarchy.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Role } from '../entities/role.entity'

@Injectable()
export class RoleHierarchyGuard implements CanActivate {
  constructor(
    @InjectRepository(Role)
    private roleRepository: Repository<Role>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const user = request.user
    const body = request.body
    const params = request.params

    // Skip for super-admin
    if (user.role === 'super-admin' || (user.isSuperAdmin && user.isSuperAdmin())) {
      return true
    }

    // Get target role being assigned/modified
    const targetRoleId = body.roleId || params.id
    if (!targetRoleId) return true

    const targetRole = await this.roleRepository.findOne({ where: { id: targetRoleId } })
    if (!targetRole) return true // Let controller handle not found

    // Prevent assigning super-admin role
    if (targetRole.name === 'super-admin') {
      throw new ForbiddenException('Cannot assign super-admin role')
    }

    // Check user's highest priority role
    const userRoles = user.userRoles || []
    const userPriorities = userRoles
      .filter(ur => ur.isActive && ur.role)
      .map(ur => ur.role.priority)
    const userMaxPriority = Math.max(...userPriorities, 0)

    // Can only assign roles with lower priority
    if (targetRole.priority >= userMaxPriority) {
      throw new ForbiddenException('Cannot assign role with equal or higher priority')
    }

    return true
  }
}
```

#### 2.3 Apply Guards to Critical Endpoints

**ACL Management**:
```typescript
// src/modules/acl/controllers/roles.controller.ts
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // Add SuperAdminGuard
@Controller('v1/roles')
export class RolesController { }

// src/modules/acl/controllers/permissions.controller.ts
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // Add SuperAdminGuard
@Controller('v1/permissions')
export class PermissionsController { }
```

**User Role Assignment**:
```typescript
// src/modules/users/controllers/user-roles.controller.ts
@Post()
@UseGuards(JwtAuthGuard, AbilityGuard, RoleHierarchyGuard)  // Add RoleHierarchyGuard
@CheckAbility({ action: Action.Assign, subject: Subject.Role })
async assignRole() { }
```

**Admin Password Management**:
```typescript
// src/modules/users/controllers/admin-users.controller.ts
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // Replace with SuperAdminGuard
@Controller('admin/users')
export class AdminUsersController { }
```

**Audit Logs**:
```typescript
// src/modules/audit/controllers/audit.controller.ts
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // Add SuperAdminGuard
@Controller('audit')
export class AuditController { }
```

**Session Cleanup**:
```typescript
// src/modules/auth/controllers/sessions.controller.ts
@Post('cleanup')
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // Replace hard-coded check
async manualCleanup() { 
  // Remove: if (user?.role !== 'admin') { throw ... }
}
```

### Phase 3: Enhanced Permission Seeding

#### 3.1 Remove Dangerous Permissions from Admin Role

**Current** (from `acl.seeder.ts`):
```typescript
// Admin - broad permissions except role/permission management
const adminPerms = permissions.filter(
  p => p.subject !== Subject.Role &&
       p.subject !== Subject.Permission &&
       p.subject !== Subject.All &&
       !p.conditions?.userId
)
```

**Issues**:
- Admin can still do `Update:User` (no conditions) → can reset any password
- Admin can do `Read:Session`, `Delete:Session` (no conditions) → can terminate any user's sessions
- Admin has `Read:AuditLog` → can see all audit trails

**Proposed**:
```typescript
// Admin - restricted permissions
const adminPerms = permissions.filter(p => {
  // Exclude ACL management
  if ([Subject.Role, Subject.Permission, Subject.All].includes(p.subject)) {
    return false
  }

  // Exclude unrestricted user operations
  if (p.subject === Subject.User && !p.conditions?.id) {
    return false
  }

  // Exclude global session management
  if (p.subject === Subject.Session && !p.conditions?.userId) {
    return false
  }

  // Exclude audit log access
  if (p.subject === Subject.AuditLog) {
    return false
  }

  return !p.conditions?.userId  // No user-specific conditions
})

// Add specific admin permissions with conditions
const adminSpecificPerms = [
  // Can update own profile
  findPerm(Action.Update, Subject.User, { id: '${userId}' }),
  // Can view own sessions
  findPerm(Action.Read, Subject.Session, { userId: '${userId}' }),
  // Can delete own sessions
  findPerm(Action.Delete, Subject.Session, { userId: '${userId}' })
]

for (const perm of [...adminPerms, ...adminSpecificPerms.filter(Boolean)]) {
  await this.assignPermission(admin, perm)
}
```

#### 3.2 Add New Super-Admin-Only Permissions

```typescript
// Add to createPermissions()
const superAdminOnlyPerms = [
  // Password management
  { 
    action: Action.Update, 
    subject: Subject.User, 
    reason: 'Admin can reset any user password',
    fields: ['passwordHash']
  },
  
  // Global session management
  { 
    action: Action.Read, 
    subject: Subject.Session, 
    reason: 'View all user sessions' 
  },
  { 
    action: Action.Delete, 
    subject: Subject.Session, 
    reason: 'Terminate any user session' 
  },
  
  // Audit log access
  { 
    action: Action.Read, 
    subject: Subject.AuditLog, 
    reason: 'View system audit logs' 
  },
  { 
    action: Action.Export, 
    subject: Subject.AuditLog, 
    reason: 'Export audit logs for compliance' 
  },
  
  // System settings
  { 
    action: Action.Update, 
    subject: Subject.Setting, 
    reason: 'Modify system settings' 
  }
]
```

### Phase 4: Additional Enhancements

#### 4.1 Role Assignment Audit Logging

```typescript
// src/modules/users/services/user-roles.service.ts
async assignRole(userId: string, dto: AssignRoleDto) {
  // ... existing logic ...
  
  // Add audit log
  await this.auditService.log({
    action: AuditAction.ROLE_ASSIGNED,
    userId: currentUser.id,
    entityType: 'UserRole',
    entityId: userRole.id,
    metadata: {
      targetUserId: userId,
      roleId: dto.roleId,
      roleName: role.name,
      expiresAt: dto.expiresAt
    },
    severity: 'high'  // Role changes are high severity
  })
}
```

#### 4.2 Super Admin Protection

```typescript
// Prevent super-admin users from being modified by non-super-admins
// src/modules/users/services/users.service.ts

async update(id: string, updateDto: UpdateUserDto, currentUser: User) {
  const targetUser = await this.findOne(id)
  
  // Protect super-admin users
  if (targetUser.isSuperAdmin() && !currentUser.isSuperAdmin()) {
    throw new ForbiddenException('Cannot modify super-admin users')
  }
  
  // ... rest of update logic
}
```

#### 4.3 Role-Based Rate Limiting

```typescript
// Different rate limits based on role
// src/modules/acl/decorators/role-throttle.decorator.ts

export const RoleThrottle = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const original = descriptor.value
    
    descriptor.value = async function(...args: any[]) {
      const request = args[0]  // Assume first arg is request
      const user = request.user
      
      let limit = 10  // Default
      if (user.isSuperAdmin()) limit = 1000
      else if (user.isAdmin()) limit = 100
      else if (user.hasRole('moderator')) limit = 50
      
      // Apply throttle with calculated limit
      // ... throttle logic
      
      return original.apply(this, args)
    }
  }
}
```

---

## Implementation Checklist

### Phase 1: Core Role System (Week 1)
- [ ] Create migration to add `primary_role_id` column
- [ ] Write data migration script
- [ ] Update User entity to remove `role` column references
- [ ] Update JWT strategy to use ACL roles
- [ ] Update all `user.role === 'super-admin'` checks to `user.isSuperAdmin()`
- [ ] Test role checking across all modules
- [ ] Update documentation

### Phase 2: Super-Admin Guards (Week 2)
- [ ] Create `SuperAdminGuard`
- [ ] Create `RoleHierarchyGuard`
- [ ] Apply `SuperAdminGuard` to:
  - [ ] ACL controllers (roles, permissions)
  - [ ] Admin password management
  - [ ] Audit log controller
  - [ ] Session cleanup endpoint
- [ ] Apply `RoleHierarchyGuard` to user role assignment
- [ ] Write guard unit tests
- [ ] Write e2e tests for protected endpoints
- [ ] Update API documentation

### Phase 3: Permission Restructuring (Week 3)
- [ ] Update `acl.seeder.ts` to remove dangerous admin permissions
- [ ] Add super-admin-only permissions
- [ ] Add condition-based permissions for admins
- [ ] Create migration to update existing role-permission mappings
- [ ] Test with existing admin users
- [ ] Document new permission structure

### Phase 4: Enhancements (Week 4)
- [ ] Add audit logging for role assignments
- [ ] Implement super-admin user protection
- [ ] Add role-based rate limiting
- [ ] Create role management documentation
- [ ] Update API reference with new guards
- [ ] Create runbook for role escalation scenarios

### Testing & Validation
- [ ] Unit tests for all new guards
- [ ] Integration tests for critical endpoints
- [ ] Security penetration testing:
  - [ ] Privilege escalation attempts
  - [ ] Password reset abuse
  - [ ] Audit log access
  - [ ] Role assignment bypass
- [ ] Performance testing with role hierarchy checks
- [ ] Documentation review

---

## Risk Assessment

### High Risk Items
1. **Data Migration**: Migrating from `user.role` to `primary_role_id` could break existing systems
   - **Mitigation**: Phased migration, keep both columns initially, extensive testing
   
2. **Breaking Changes**: Existing admin users will lose some permissions
   - **Mitigation**: Clear communication, migration guide, rollback plan

3. **JWT Token Changes**: Modifying JWT payload structure
   - **Mitigation**: Support both old and new token formats during transition

### Medium Risk Items
1. **Performance Impact**: Additional guard checks on every request
   - **Mitigation**: Cache role hierarchy lookups, optimize guard logic

2. **Backward Compatibility**: Third-party integrations might check `user.role`
   - **Mitigation**: Maintain compatibility layer, deprecation notices

---

## Success Metrics

- ✅ Zero privilege escalation vulnerabilities
- ✅ All critical endpoints protected by super-admin guard
- ✅ 100% test coverage for new guards
- ✅ No performance degradation (< 5ms overhead per request)
- ✅ All existing functionality preserved for authorized users
- ✅ Clear audit trail for all role changes

---

## Next Steps

1. **Review this document** with team for feedback
2. **Create detailed tickets** for each phase
3. **Set up feature branch** for development
4. **Begin Phase 1** implementation
5. **Schedule security review** after each phase

---

## Questions for Discussion

1. Should we maintain backward compatibility with `user.role` column indefinitely or remove it?
2. Do we need intermediate admin levels (e.g., "senior-admin" with priority 95)?
3. Should moderators have any audit log access (e.g., for content moderation decisions)?
4. What's the rollback strategy if production issues occur?
5. Timeline: 4 weeks realistic or need more time?

