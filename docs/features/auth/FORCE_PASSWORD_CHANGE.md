# Force Password Change - Implementation Complete

## Overview

Complete implementation of force password change functionality that requires users to change their password before accessing the system. This is triggered when administrators reset passwords or set temporary passwords.

## Implementation Summary

### 1. Database Layer ✅

**Migration: `1730140000000-AddForcePasswordChangeToUsers.ts`**
- Added `forcePasswordChange` boolean column to `users` table
- Default value: `false`
- Column comment: "Requires user to change password on next login"

**User Entity Update:**
```typescript
@Column({ default: false })
forcePasswordChange: boolean
```

### 2. Login Flow Enhancement ✅

**Modified `AuthService.login()`:**

When user logs in:
1. Check if `user.forcePasswordChange === true`
2. If true:
   - Do NOT create session
   - Return special response with `requiresPasswordChange: true`
   - Include temporary access token (15-minute expiry, limited scope)
   - User cannot access system until password is changed
3. If false:
   - Normal login flow (create session, return tokens)

**Response when password change required:**
```json
{
  "requiresPasswordChange": true,
  "userId": "user-uuid",
  "message": "Password change required. Please change your password before accessing the system.",
  "tempAccessToken": "jwt-token-15min-expiry"
}
```

**Normal login response:**
```json
{
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "user": {
    "id": "user-uuid",
    "name": "User Name",
    "email": "user@example.com",
    "role": "ROLE_USER"
  }
}
```

### 3. Password Change Endpoint ✅

**POST `/v1/auth/change-password`**

**Authentication:** Bearer token (temp token or regular token)

**Rate Limiting:** 5 attempts per 5 minutes

**Request:**
```json
{
  "currentPassword": "TemporaryPass@123",
  "newPassword": "NewSecure@Pass456",
  "confirmPassword": "NewSecure@Pass456"
}
```

**Response:**
```json
{
  "message": "Password changed successfully. Please login with your new password.",
  "success": true
}
```

**Validations:**
- Current password must be correct
- New password must be different from current
- New password must meet strength requirements:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character (@$!%*?&)
- New password and confirmation must match

**Side Effects:**
1. Password hash updated in database
2. `forcePasswordChange` flag set to `false`
3. All existing sessions invalidated (user must login again)
4. Audit log entry created

### 4. Admin Integration ✅

**Admin password management automatically sets `forcePasswordChange: true`:**

**System-Generated Reset:**
```typescript
user.passwordHash = passwordHash
user.forcePasswordChange = forcePasswordChange // default: true
```

**Admin-Defined Password:**
```typescript
user.passwordHash = passwordHash
user.forcePasswordChange = forcePasswordChange // default: true
```

## User Flow

### Scenario 1: Admin Resets User Password

1. **Admin Action:**
   ```bash
   POST /v1/admin/users/reset-password
   {
     "userId": "user-uuid",
     "forcePasswordChange": true,
     "reason": "User forgot password"
   }
   ```
   Response includes temporary password: `"temporaryPassword": "aB3$cD4!eF5@"`

2. **User Login Attempt:**
   ```bash
   POST /v1/auth/login
   {
     "email": "user@example.com",
     "password": "aB3$cD4!eF5@"
   }
   ```
   Response:
   ```json
   {
     "requiresPasswordChange": true,
     "userId": "user-uuid",
     "message": "Password change required...",
     "tempAccessToken": "eyJhbGc..."
   }
   ```

3. **User Changes Password:**
   ```bash
   POST /v1/auth/change-password
   Authorization: Bearer <tempAccessToken>
   {
     "currentPassword": "aB3$cD4!eF5@",
     "newPassword": "MyNewSecure@Pass789",
     "confirmPassword": "MyNewSecure@Pass789"
   }
   ```
   Response: Success message

4. **User Logs In with New Password:**
   ```bash
   POST /v1/auth/login
   {
     "email": "user@example.com",
     "password": "MyNewSecure@Pass789"
   }
   ```
   Response: Normal login with access + refresh tokens

### Scenario 2: Admin Sets Specific Password

1. **Admin Action:**
   ```bash
   POST /v1/admin/users/set-password
   {
     "userId": "user-uuid",
     "newPassword": "TempAccess@123",
     "forcePasswordChange": true,
     "reason": "Emergency access",
     "sendNotification": false
   }
   ```

2. **User follows same flow as Scenario 1** (steps 2-4)

## Frontend Integration Guide

### 1. Handle Login Response

```typescript
// Login request
const loginResponse = await fetch('/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})

const data = await loginResponse.json()

// Check if password change required
if (data.requiresPasswordChange) {
  // Store temp token
  sessionStorage.setItem('tempToken', data.tempAccessToken)
  sessionStorage.setItem('userId', data.userId)
  
  // Redirect to password change page
  router.push('/change-password')
  
  // Show message
  alert(data.message)
} else {
  // Normal login flow
  localStorage.setItem('accessToken', data.accessToken)
  localStorage.setItem('refreshToken', data.refreshToken)
  router.push('/dashboard')
}
```

### 2. Password Change Page

```typescript
// change-password.tsx
import { useState } from 'react'

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Get temp token
    const tempToken = sessionStorage.getItem('tempToken')
    
    if (!tempToken) {
      setError('Session expired. Please login again.')
      return
    }
    
    try {
      const response = await fetch('/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tempToken}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        setError(error.message)
        return
      }
      
      const data = await response.json()
      
      // Clear temp token
      sessionStorage.removeItem('tempToken')
      sessionStorage.removeItem('userId')
      
      // Show success message
      alert(data.message)
      
      // Redirect to login
      router.push('/login')
      
    } catch (err) {
      setError('Failed to change password. Please try again.')
    }
  }
  
  return (
    <div>
      <h1>Change Password Required</h1>
      <p>You must change your password before accessing the system.</p>
      
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Current Password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        
        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        
        <input
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        
        {error && <p className="error">{error}</p>}
        
        <button type="submit">Change Password</button>
      </form>
    </div>
  )
}
```

### 3. Password Strength Indicator

```typescript
const getPasswordStrength = (password: string): string => {
  if (password.length < 8) return 'Too short'
  
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[@$!%*?&]/.test(password)
  
  if (hasUpper && hasLower && hasNumber && hasSpecial) {
    return 'Strong'
  }
  
  if (hasUpper && hasLower && (hasNumber || hasSpecial)) {
    return 'Medium'
  }
  
  return 'Weak'
}

// Usage in component
<div>
  <input
    type="password"
    value={newPassword}
    onChange={(e) => setNewPassword(e.target.value)}
  />
  <span className={`strength-${getPasswordStrength(newPassword).toLowerCase()}`}>
    {getPasswordStrength(newPassword)}
  </span>
</div>
```

## Security Features

### 1. Temporary Access Token
- **Purpose**: Allow password change without full system access
- **Expiry**: 15 minutes (short window for security)
- **Scope**: Can only be used for `/v1/auth/change-password` endpoint
- **Payload Flag**: `tempPasswordChange: true` identifies it as temp token

### 2. Session Invalidation
- All user sessions revoked after password change
- User must login again with new password
- Prevents session hijacking with old credentials

### 3. Password Reuse Prevention
- Cannot reuse current password as "new" password
- Forces actual password rotation

### 4. Rate Limiting
- Change password endpoint: 5 attempts per 5 minutes
- Prevents brute force attacks on password change

### 5. Audit Trail
All actions logged with PinoLogger:

**Password Change Required (Login):**
```javascript
{
  userId: "uuid",
  email: "user@example.com",
  action: "password_change_required"
}
// Level: WARN
// Message: "User must change password before accessing system"
```

**Password Changed:**
```javascript
{
  userId: "uuid",
  email: "user@example.com",
  ipAddress: "192.168.1.100",
  action: "password_changed"
}
// Level: INFO
// Message: "User changed password successfully"
```

**Sessions Revoked:**
```javascript
{
  userId: "uuid",
  action: "sessions_revoked_after_password_change"
}
// Level: INFO
// Message: "All sessions revoked after password change"
```

## Testing

### Test Case 1: Force Password Change Flow

```bash
# 1. Admin resets user password
ADMIN_TOKEN="admin-jwt-token"
USER_ID="user-uuid"

RESET_RESPONSE=$(curl -s -X POST http://localhost:4000/v1/admin/users/reset-password \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"forcePasswordChange\": true,
    \"reason\": \"Testing force password change\"
  }")

TEMP_PASSWORD=$(echo $RESET_RESPONSE | jq -r '.temporaryPassword')
echo "Temporary password: $TEMP_PASSWORD"

# 2. User logs in with temporary password
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"user@example.com\",
    \"password\": \"$TEMP_PASSWORD\"
  }")

echo "Login response:"
echo $LOGIN_RESPONSE | jq .

# Expected: requiresPasswordChange: true
REQUIRES_CHANGE=$(echo $LOGIN_RESPONSE | jq -r '.requiresPasswordChange')
if [ "$REQUIRES_CHANGE" == "true" ]; then
  echo "✅ Password change required (as expected)"
else
  echo "❌ Password change NOT required (unexpected)"
  exit 1
fi

# Get temp access token
TEMP_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.tempAccessToken')

# 3. User changes password
CHANGE_RESPONSE=$(curl -s -X POST http://localhost:4000/v1/auth/change-password \
  -H "Authorization: Bearer $TEMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"currentPassword\": \"$TEMP_PASSWORD\",
    \"newPassword\": \"NewSecure@Pass123\",
    \"confirmPassword\": \"NewSecure@Pass123\"
  }")

echo "Change password response:"
echo $CHANGE_RESPONSE | jq .

# Expected: success: true
SUCCESS=$(echo $CHANGE_RESPONSE | jq -r '.success')
if [ "$SUCCESS" == "true" ]; then
  echo "✅ Password changed successfully"
else
  echo "❌ Password change failed"
  exit 1
fi

# 4. User logs in with new password
FINAL_LOGIN=$(curl -s -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"user@example.com\",
    \"password\": \"NewSecure@Pass123\"
  }")

echo "Final login response:"
echo $FINAL_LOGIN | jq .

# Expected: accessToken and refreshToken present, no requiresPasswordChange
ACCESS_TOKEN=$(echo $FINAL_LOGIN | jq -r '.accessToken')
if [ "$ACCESS_TOKEN" != "null" ] && [ "$ACCESS_TOKEN" != "" ]; then
  echo "✅ Login successful with new password"
else
  echo "❌ Login failed with new password"
  exit 1
fi

echo "✅ All tests passed!"
```

### Test Case 2: Validation Errors

```bash
# Test 1: Passwords don't match
curl -X POST http://localhost:4000/v1/auth/change-password \
  -H "Authorization: Bearer $TEMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Current@123",
    "newPassword": "NewPass@123",
    "confirmPassword": "DifferentPass@123"
  }'
# Expected: 400 Bad Request - "New password and confirmation do not match"

# Test 2: Current password incorrect
curl -X POST http://localhost:4000/v1/auth/change-password \
  -H "Authorization: Bearer $TEMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "WrongPassword@123",
    "newPassword": "NewPass@123",
    "confirmPassword": "NewPass@123"
  }'
# Expected: 401 Unauthorized - "Current password is incorrect"

# Test 3: Reusing same password
curl -X POST http://localhost:4000/v1/auth/change-password \
  -H "Authorization: Bearer $TEMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Current@123",
    "newPassword": "Current@123",
    "confirmPassword": "Current@123"
  }'
# Expected: 401 Unauthorized - "New password must be different from current password"

# Test 4: Weak password
curl -X POST http://localhost:4000/v1/auth/change-password \
  -H "Authorization: Bearer $TEMP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Current@123",
    "newPassword": "weak",
    "confirmPassword": "weak"
  }'
# Expected: 400 Bad Request - Password validation errors
```

## Database Schema

```sql
-- users table with forcePasswordChange column
ALTER TABLE users ADD COLUMN "forcePasswordChange" boolean DEFAULT false;
COMMENT ON COLUMN users."forcePasswordChange" IS 'Requires user to change password on next login';

-- Example queries

-- Find all users who need to change password
SELECT id, email, name, "forcePasswordChange", "updatedAt"
FROM users
WHERE "forcePasswordChange" = true;

-- Set force password change for specific user
UPDATE users
SET "forcePasswordChange" = true
WHERE id = 'user-uuid';

-- Clear force password change flag (done automatically by change password endpoint)
UPDATE users
SET "forcePasswordChange" = false
WHERE id = 'user-uuid';
```

## API Reference

### Change Password Endpoint

**Endpoint:** `POST /v1/auth/change-password`

**Authentication:** Required (Bearer token - temp or regular)

**Rate Limit:** 5 requests per 5 minutes

**Request Headers:**
```
Authorization: Bearer <tempAccessToken or accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string (min 8 chars, 1 upper, 1 lower, 1 number, 1 special)",
  "confirmPassword": "string (must match newPassword)"
}
```

**Success Response (200):**
```json
{
  "message": "Password changed successfully. Please login with your new password.",
  "success": true
}
```

**Error Responses:**

**400 Bad Request** - Validation errors:
```json
{
  "statusCode": 400,
  "message": ["Password must be at least 8 characters long"],
  "error": "Bad Request"
}
```

**401 Unauthorized** - Authentication/authorization errors:
```json
{
  "statusCode": 401,
  "message": "Current password is incorrect",
  "error": "Unauthorized"
}
```

or

```json
{
  "statusCode": 401,
  "message": "New password must be different from current password",
  "error": "Unauthorized"
}
```

**429 Too Many Requests** - Rate limit exceeded:
```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

## Summary

✅ **Database**: `forcePasswordChange` column added to users table
✅ **Login Flow**: Enhanced to check flag and return special response
✅ **Password Change**: New endpoint with validation and security
✅ **Admin Integration**: Both reset/set password options set flag
✅ **Security**: Temp tokens, session invalidation, audit logging
✅ **Frontend**: Clear integration guide with code examples
✅ **Testing**: Comprehensive test scenarios provided

The force password change feature is **fully implemented and ready for use**. Users whose passwords are reset by admins will be required to change their password before accessing the system, ensuring security and compliance.
