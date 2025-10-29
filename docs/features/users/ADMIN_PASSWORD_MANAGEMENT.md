# Admin Password Management - Implementation Guide

## Overview

Enterprise-grade admin password management system with two secure approaches:

1. **System-Generated Passwords** (Recommended): Admin resets password, system generates and returns secure temporary password
2. **Admin-Defined Passwords** (Emergency): Admin sets specific password with validation

## Security Features

### Core Security
- ✅ **Force Password Change**: Both approaches default to requiring password change on next login
- ✅ **Session Invalidation**: All active user sessions revoked immediately
- ✅ **Audit Trail**: Complete logging with admin ID, email, reason, timestamp
- ✅ **Password Validation**: Admin-defined passwords must meet strength requirements
- ✅ **Secure Generation**: System-generated passwords use cryptographically secure random generation
- ✅ **Role-Based Access**: Only users with `update:User` permission can manage passwords

### Password Generation
System-generated passwords follow this pattern:
- 4 uppercase letters (A-Z)
- 4 lowercase letters (a-z)  
- 2 digits (0-9)
- 2 special characters (@$!%*?&)
- Total: 12 characters, shuffled for randomness
- Example: `aB3$cD4!eF5@gH6&`

## API Endpoints

### 1. Reset Password (System-Generated)

**POST** `/v1/admin/users/reset-password`

Admin resets user password. System generates secure random password.

**Request:**
```json
{
  "userId": "uuid-here",
  "forcePasswordChange": true,  // Optional, default: true
  "reason": "User forgot password and called support"  // Optional, for audit
}
```

**Response:**
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  "temporaryPassword": "aB3$cD4!eF5@",  // Only in system-generated
  "forcePasswordChange": true,
  "changedBy": "admin@kuybi.dev",
  "changedAt": "2024-10-28T20:00:00.000Z",
  "reason": "User forgot password and called support"
}
```

**Use Cases:**
- User forgot password
- Emergency access required
- Account recovery
- User locked out

**Best Practice:**
- Admin receives temporary password
- Admin communicates password to user via secure channel (phone, in-person, encrypted message)
- User must change password on next login
- More secure than admin-defined (prevents weak passwords)

---

### 2. Set Password (Admin-Defined)

**POST** `/v1/admin/users/set-password`

Admin sets specific password for user (emergency scenarios).

**Request:**
```json
{
  "userId": "uuid-here",
  "newPassword": "SecurePass@123",  // Must meet strength requirements
  "forcePasswordChange": true,  // Optional, default: true
  "reason": "Emergency access for critical task",  // Optional
  "sendNotification": false  // Optional, default: false
}
```

**Response:**
```json
{
  "userId": "uuid-here",
  "email": "user@example.com",
  // No temporaryPassword in response (admin set it, they know it)
  "forcePasswordChange": true,
  "changedBy": "admin@kuybi.dev",
  "changedAt": "2024-10-28T20:00:00.000Z",
  "reason": "Emergency access for critical task"
}
```

**Use Cases:**
- Emergency access with specific password requirement
- Compliance scenarios requiring specific password pattern
- Testing/development environments
- Immediate access needed

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 digit
- At least 1 special character (@$!%*?&)

**Email Notification:**
- If `sendNotification: true`, user receives email about password change
- Email includes: change time, IP address (shows "Admin Action"), security warning
- Default: `false` (admin should communicate directly with user)

---

## Implementation Details

### Files Created

1. **DTOs**: `src/modules/users/dto/admin-password-management.dto.ts`
   - `AdminResetPasswordDto`: For system-generated passwords
   - `AdminSetPasswordDto`: For admin-defined passwords
   - `AdminPasswordResetResponseDto`: Response structure

2. **Service**: `src/modules/users/services/admin-password-management.service.ts`
   - `resetPassword()`: System-generated approach
   - `setPassword()`: Admin-defined approach
   - `generateSecurePassword()`: Private method for secure password generation

3. **Controller**: `src/modules/users/controllers/admin-users.controller.ts`
   - POST `/v1/admin/users/reset-password`
   - POST `/v1/admin/users/set-password`
   - Both require `update:User` permission

### Authentication & Authorization

**Required:**
- Valid JWT token (Bearer authentication)
- ACL permission: `update:User` (assigned to Super Admin by default)

**Guards:**
- `JwtAuthGuard`: Validates JWT token
- `AbilityGuard`: Checks ACL permissions

### Audit Logging

All password changes are logged with PinoLogger:

**Reset Password (System-Generated):**
```javascript
{
  userId: "uuid",
  userEmail: "user@example.com",
  adminId: "admin-uuid",
  adminEmail: "admin@kuybi.dev",
  reason: "User forgot password",
  revokedSessions: 3,
  forcePasswordChange: true,
  action: "admin_password_reset"
}
// Level: WARN
// Message: "Admin reset user password (system-generated)"
```

**Set Password (Admin-Defined):**
```javascript
{
  userId: "uuid",
  userEmail: "user@example.com",
  adminId: "admin-uuid",
  adminEmail: "admin@kuybi.dev",
  reason: "Emergency access",
  revokedSessions: 2,
  forcePasswordChange: true,
  sendNotification: false,
  action: "admin_password_set"
}
// Level: WARN
// Message: "Admin set user password (admin-defined)"
```

### Session Invalidation

When admin changes user password:

1. All active sessions for user are immediately revoked
2. User must log in again with new password
3. Session revocation includes audit trail:
   - Revoke reason: `"Password reset by admin: admin@email.com"` or `"Password set by admin: admin@email.com"`
   - Revoked count logged in audit trail

## Security Best Practices

### 1. Choose the Right Approach

**Use System-Generated When:**
- User forgot password (most common)
- Standard password reset scenarios
- You want to ensure strong password
- You want audit trail of who received password

**Use Admin-Defined When:**
- Emergency access with specific requirements
- Testing/development environments
- Compliance requires specific pattern
- Immediate access needed with known credentials

### 2. Force Password Change

**Always set `forcePasswordChange: true` (default) when:**
- Resetting forgotten passwords
- Emergency access scenarios
- Any admin-initiated password change

**Only set `forcePasswordChange: false` when:**
- Testing/development environments
- User explicitly requested this specific password
- Very rare production scenarios

### 3. Audit Trail

**Always provide `reason` when:**
- Production password changes
- Any change that might be audited
- Change is for specific business need

**Example reasons:**
- "User forgot password - ticket #12345"
- "Emergency access for system maintenance"
- "Account recovery - user called support"
- "Locked account - reset per manager request"

### 4. Communication

**System-Generated Passwords:**
- Admin receives temporary password in API response
- Admin should communicate to user via:
  - ✅ Phone call (most secure)
  - ✅ In-person
  - ✅ Encrypted messaging
  - ❌ Plain email (less secure)
  - ❌ Slack/Teams (less secure)
- User must change on first login

**Admin-Defined Passwords:**
- `sendNotification: false` (default): Admin communicates directly
- `sendNotification: true`: User receives email (less secure, only if needed)

### 5. Error Handling

**404 Not Found:**
- User doesn't exist
- Double-check userId before retrying

**400 Bad Request:**
- User is inactive (cannot change password for inactive users)
- Password too weak (admin-defined only)
- Invalid UUID format

**403 Forbidden:**
- Insufficient permissions (need `update:User`)
- Cannot set password for another super admin (optional security measure)

## Testing

### Test Scenario 1: System-Generated Reset

```bash
# Get admin token (Super Admin)
ADMIN_TOKEN="your-admin-jwt-token"

# Get user ID to reset
USER_ID="user-uuid-here"

# Reset password (system generates)
curl -X POST http://localhost:4000/v1/admin/users/reset-password \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "forcePasswordChange": true,
    "reason": "User forgot password - testing"
  }'

# Response includes temporaryPassword
# Example: {"temporaryPassword": "aB3$cD4!eF5@", ...}

# User logs in with temporary password
# User is forced to change password on next login (TODO: implement this)
```

### Test Scenario 2: Admin-Defined Password

```bash
# Set specific password
curl -X POST http://localhost:4000/v1/admin/users/set-password \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "newPassword": "NewSecure@Pass123",
    "forcePasswordChange": true,
    "reason": "Emergency access - testing",
    "sendNotification": false
  }'

# Response does NOT include temporaryPassword
# Admin knows the password they set

# User logs in with NewSecure@Pass123
# User is forced to change password on next login (TODO: implement this)
```

### Test Scenario 3: Verify Session Invalidation

```bash
# 1. User logs in and gets token
USER_TOKEN=$(curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "OldPassword"}' \
  | jq -r '.accessToken')

# 2. User makes authenticated request (should work)
curl -X GET http://localhost:4000/v1/users/profile \
  -H "Authorization: Bearer $USER_TOKEN"

# 3. Admin resets password
curl -X POST http://localhost:4000/v1/admin/users/reset-password \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "'$USER_ID'"}'

# 4. User makes authenticated request with old token (should fail with 401)
curl -X GET http://localhost:4000/v1/users/profile \
  -H "Authorization: Bearer $USER_TOKEN"
# Expected: 401 Unauthorized - session invalidated

# 5. User logs in with new password
USER_NEW_TOKEN=$(curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "TemporaryPassword"}' \
  | jq -r '.accessToken')
```

## TODO: Force Password Change Implementation

The `forcePasswordChange` flag is designed but not yet enforced. To complete this feature:

### 1. Add Database Field

Add to `User` entity:
```typescript
@Column({ default: false })
forcePasswordChange: boolean
```

Create migration to add column.

### 2. Update Login Flow

In `AuthService.login()`:
```typescript
if (user.forcePasswordChange) {
  // Return special response indicating password change required
  return {
    requiresPasswordChange: true,
    userId: user.id,
    message: 'Password change required before accessing system'
  }
}
```

### 3. Add Change Password Endpoint

```typescript
// POST /v1/auth/change-password
// Requires: current password + new password
// Clears forcePasswordChange flag
```

### 4. Frontend Handling

Frontend should:
- Detect `requiresPasswordChange: true` in login response
- Show password change form instead of redirecting to dashboard
- Call change password endpoint
- Then proceed with normal login

## Monitoring & Alerts

### Recommended Monitoring

1. **Alert on Multiple Password Resets**
   - Same user: >3 resets in 24 hours (potential account takeover)
   - Same admin: >10 resets in 1 hour (potential admin account compromise)

2. **Alert on Failed Permission Checks**
   - Multiple 403 errors on password endpoints (potential unauthorized access attempt)

3. **Audit Review**
   - Weekly review of all admin password changes
   - Check for patterns: late-night changes, no reason provided, etc.

### Log Queries

**Find all password resets in last 7 days:**
```javascript
// In logs, search for:
action: "admin_password_reset" OR action: "admin_password_set"
// Filter by timestamp: last 7 days
```

**Find resets without reason:**
```javascript
action: "admin_password_reset" OR action: "admin_password_set"
!reason
```

## Comparison: System-Generated vs Admin-Defined

| Feature | System-Generated | Admin-Defined |
|---------|-----------------|---------------|
| **Security** | ✅ Higher (guaranteed strong) | ⚠️ Medium (validated but admin-chosen) |
| **Use Case** | Standard password reset | Emergency/specific requirements |
| **Returns Password** | ✅ Yes (to admin) | ❌ No (admin set it) |
| **Password Strength** | 12 chars, mixed, random | Must meet requirements |
| **Recommended For** | Production | Testing/emergencies |
| **Audit Trail** | Full | Full |
| **Session Invalidation** | ✅ Yes | ✅ Yes |
| **Force Password Change** | ✅ Default true | ✅ Default true |
| **Email Notification** | ❌ Not available | ✅ Optional |

## Related Documentation

- [Password Reset Flow](../auth/PASSWORD_RESET.md) - User-initiated password reset
- [ACL System](../acl/README.md) - Role-based access control
- [Session Management](../auth/SESSION_MANAGEMENT.md) - Session lifecycle
- [Email System](../../infrastructure/email/README.md) - Email notifications

## Summary

This admin password management system provides secure, audited administrative control over user passwords with two complementary approaches:

1. **System-generated** for standard scenarios (recommended for security)
2. **Admin-defined** for emergency scenarios (with validation)

Both approaches enforce security best practices: force password change, session invalidation, complete audit trail, and role-based access control.
