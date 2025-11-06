# RBAC Enhancement - Quick Checklist

**Branch**: `feature/rbac-enhancement`

---

## 🚨 URGENT - Critical Vulnerabilities

- [ ] **Privilege Escalation**: Admin can assign super-admin role to themselves
- [ ] **Password Reset Abuse**: Admin can reset super-admin passwords  
- [ ] **Audit Log Access**: Admin can view all security events

**Quick Fix Available**: See RBAC_ENHANCEMENT_SUMMARY.md

---

## 📋 Phase 1: Core Role System (Week 1)

### Database
- [ ] Create migration `AddPrimaryRoleToUsers`
- [ ] Test migration on local database
- [ ] Verify data migration (super-admin → role, ROLE_USER → user role)
- [ ] Ensure all users have user_roles entries
- [ ] Rollback test

### User Entity  
- [ ] Add `primary_role_id` column
- [ ] Add `primaryRole` ManyToOne relation
- [ ] Update `hasRole()` method
- [ ] Add `getPrimaryRoleName()` method
- [ ] Add `getHighestPriorityRole()` method
- [ ] Add `canManageUser()` method
- [ ] Add `canAssignRole()` method
- [ ] Mark old `role` column as deprecated

### JWT Strategy
- [ ] Update `validate()` to load primaryRole relation
- [ ] Update token payload to include role name
- [ ] Test token generation
- [ ] Test token validation

### Testing
- [ ] Unit tests for User entity methods (12 tests)
- [ ] Integration tests for JWT with new payload
- [ ] Migration tests (up and down)

---

## 🛡️ Phase 2: Super-Admin Guards (Week 2)

### Create Guards
- [ ] `SuperAdminGuard` - restrict to super-admin only
- [ ] `RoleHierarchyGuard` - enforce role priority rules
- [ ] `AdminOrOwnerGuard` - admin OR resource owner
- [ ] Export guards from `guards/index.ts`
- [ ] Register guards in AclModule

### Testing
- [ ] SuperAdminGuard unit tests (5 cases)
- [ ] RoleHierarchyGuard unit tests (8 cases)
- [ ] AdminOrOwnerGuard unit tests (6 cases)
- [ ] Mock ExecutionContext properly
- [ ] Test all error scenarios

---

## 🔒 Phase 3: Apply Guards (Week 3)

### ACL Controllers
- [ ] `RolesController` → Add `SuperAdminGuard`
- [ ] `PermissionsController` → Add `SuperAdminGuard`
- [ ] Remove individual `@CheckAbility` decorators
- [ ] Update API documentation

### Admin Controllers
- [ ] `AdminUsersController` → Add `SuperAdminGuard`
- [ ] Update password reset endpoint
- [ ] Update set password endpoint
- [ ] Update API documentation

### Audit Controller
- [ ] `AuditController` → Add `SuperAdminGuard`
- [ ] Protect all endpoints
- [ ] Update API documentation

### User Role Controller
- [ ] `UserRolesController.assignRole()` → Add `RoleHierarchyGuard`
- [ ] `UserRolesController.revokeRole()` → Add `RoleHierarchyGuard`
- [ ] Test hierarchy enforcement

### Sessions Controller
- [ ] `SessionsController.manualCleanup()` → Add `SuperAdminGuard`
- [ ] Remove hard-coded admin check
- [ ] Update API documentation

### Testing
- [ ] E2E tests for each protected endpoint (15 scenarios)
- [ ] Test super-admin access (should pass)
- [ ] Test admin access (should fail)
- [ ] Test user access (should fail)
- [ ] Test unauthenticated access (should fail)

---

## 🔧 Phase 4: Enhanced Services (Week 4)

### UsersService
- [ ] Add super-admin protection to `update()`
- [ ] Add super-admin protection to `delete()`
- [ ] Add `canManageUser()` check
- [ ] Test modifications blocked for super-admins

### UserRolesService  
- [ ] Add audit logging to `assignRole()`
- [ ] Add audit logging to `revokeRole()`
- [ ] Include metadata (who, when, which role)
- [ ] Set severity to 'high'

### Permission Seeder
- [ ] Remove dangerous admin permissions
- [ ] Add condition-based admin permissions
- [ ] Add super-admin-only permissions
- [ ] Test seeder on clean database

### Testing
- [ ] Service unit tests with role checks
- [ ] Audit log verification tests
- [ ] Permission seeder tests

---

## 🧪 Testing & Validation

### Security Testing
- [ ] Privilege escalation attack (should fail)
- [ ] Password reset abuse attempt (should fail)
- [ ] Audit log bypass attempt (should fail)
- [ ] Token manipulation tests
- [ ] Role hierarchy bypass attempts

### Performance Testing
- [ ] Measure guard overhead (<5ms target)
- [ ] Load testing with guards enabled
- [ ] Compare before/after metrics

### Integration Testing
- [ ] Full user journey as super-admin
- [ ] Full user journey as admin
- [ ] Full user journey as regular user
- [ ] Cross-role interaction tests

---

## 📚 Documentation

- [ ] Update API reference with new guards
- [ ] Document permission changes
- [ ] Create migration guide for existing admins
- [ ] Update architecture docs
- [ ] Add security best practices section

---

## 🚀 Deployment

### Pre-Deployment
- [ ] All tests passing (unit, integration, e2e)
- [ ] Code review completed
- [ ] Security review completed
- [ ] Staging deployment successful
- [ ] Admin users notified of changes

### Deployment Steps
- [ ] Backup production database
- [ ] Run migrations
- [ ] Deploy new code
- [ ] Verify super-admin access works
- [ ] Monitor 403 error rates
- [ ] Check audit logs for role changes

### Post-Deployment
- [ ] Smoke tests on production
- [ ] Monitor for 1 hour
- [ ] Verify existing super-admin users unaffected
- [ ] Verify admin users have expected restrictions
- [ ] Document any issues

### Rollback (If Needed)
- [ ] Revert code deployment
- [ ] Rollback database migration
- [ ] Restore `user.role` column usage
- [ ] Verify system functionality
- [ ] Post-mortem meeting

---

## 📊 Success Criteria

- [ ] Zero privilege escalation vulnerabilities
- [ ] All critical endpoints protected
- [ ] 100% test coverage for guards
- [ ] <5ms performance overhead
- [ ] All existing functionality preserved
- [ ] Clear audit trail for role changes
- [ ] No production incidents

---

## 🎯 Current Status

**Completed**:
- ✅ Vulnerability analysis
- ✅ Solution design
- ✅ Documentation created
- ✅ Planning committed to git

**Next**: Team review and Phase 1 kickoff

---

## 📞 Quick Links

- [Executive Summary](./RBAC_ENHANCEMENT_SUMMARY.md)
- [Detailed Analysis](./RBAC_ENHANCEMENT_ANALYSIS.md)  
- [Implementation Guide](./RBAC_IMPLEMENTATION_GUIDE.md)

---

**Last Updated**: November 6, 2024  
**Branch**: feature/rbac-enhancement  
**Commits**: 2 (analysis + summary)
