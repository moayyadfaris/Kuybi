# Super Admin Unrestricted Access

## Overview

The `super-admin` role has been configured to bypass **all** permission checks and database lookups in the ACL system. This provides unrestricted access to all API endpoints without requiring explicit permissions to be assigned.

## How It Works

### 1. **AbilityGuard Bypass**

The `AbilityGuard` checks if the authenticated user has the `super-admin` role before performing any permission checks:

```typescript
// Super-admin bypasses all permission checks
if (user.isSuperAdmin && user.isSuperAdmin()) {
  return true
}
```

- **No database queries** for permissions
- **No CASL ability checks**
- **Immediate access granted**

### 2. **AbilityFactory Full Access**

If CASL abilities are needed (for programmatic checks), super-admins get the `manage all` permission:

```typescript
// Super-admin gets unrestricted access to everything
if (user.isSuperAdmin && user.isSuperAdmin()) {
  can(Action.Manage, Subject.All)
  return build()
}
```

This gives super-admins all possible permissions through CASL's special `manage all` rule.

## Benefits

✅ **Performance**: No database queries for permission checks  
✅ **Simplicity**: No need to assign individual permissions to super-admins  
✅ **Flexibility**: Full access to all current and future endpoints  
✅ **Security**: Only users with `super-admin` role assignment get this privilege

## Checking Super Admin Status

### In Code

```typescript
// Using the User entity method
if (user.isSuperAdmin()) {
  // Super admin logic
}

// Manual check
if (user.hasRole('super-admin')) {
  // Super admin logic
}
```

### Role Assignment

To grant super-admin access to a user:

```bash
POST /api/users/:userId/roles
{
  "roleId": "<super-admin-role-id>",
  "isActive": true
}
```

## Security Considerations

⚠️ **Important**: The super-admin role should be:
- Granted only to trusted system administrators
- Regularly audited for active assignments
- Protected with strong authentication requirements
- Limited to a minimal number of users

## Implementation Details

### Files Modified

1. **`src/acl/abilities/ability.guard.ts`**
   - Added super-admin check before permission validation
   - Returns `true` immediately for super-admins

2. **`src/acl/abilities/ability.factory.ts`**
   - Added super-admin check in `createForUser()`
   - Grants `Action.Manage` on `Subject.All` for super-admins

3. **`src/users/entities/user.entity.ts`**
   - Already has `isSuperAdmin()` helper method
   - Checks for active, non-expired `super-admin` role

## Example Flow

### Regular User
```
Request → JwtAuthGuard → AbilityGuard → Check DB → Load Roles → Load Permissions → Evaluate CASL → Grant/Deny
```

### Super Admin
```
Request → JwtAuthGuard → AbilityGuard → Check isSuperAdmin() → Grant ✅
```

## Testing

To test super-admin access:

1. **Assign super-admin role** to a test user
2. **Login** as that user to get JWT token
3. **Call any protected endpoint** - access should be granted
4. **Verify no permission errors** regardless of the endpoint

Example test:
```bash
# Login as super-admin
POST /api/v1/auth/login
{ "email": "admin@example.com", "password": "password" }

# Try any protected endpoint
DELETE /api/v1/stories/123/hard
# Should succeed without permission errors

# Create a category
POST /api/v1/categories
{ "name": "Sports" }
# Should succeed without permission checks

# Assign roles
POST /api/v1/users/123/roles
{ "roleId": 2, "isActive": true }
# Should succeed with full access
```

## Monitoring

Super-admin actions should be logged for audit purposes. Consider implementing:

- **Audit logs** for all super-admin API calls
- **Alerts** for super-admin role assignments
- **Regular reviews** of super-admin users
- **Time-limited** super-admin role assignments using `expiresAt`

## Fallback Behavior

If the `super-admin` role is:
- **Inactive** (`isActive: false`) - Access denied
- **Expired** (`expiresAt` in past) - Access denied  
- **Not assigned** - Falls back to regular permission checks

The system always respects role activation status and expiration dates, even for super-admins.
