# Admin Password Management API - Frontend Integration Guide

## Overview

Super-admin users can reset or set user passwords with full control over whether users must change their password on first login.

**Base URL:** `http://localhost:4040/api/admin/users`

**Authentication:** Super-admin JWT token required

**Permissions:** Super-admin only (protected by `SuperAdminGuard`)

---

## Endpoints

### 1. Reset User Password (System Generated)

**Endpoint:** `POST /admin/users/reset-password`

**Description:** System generates a secure random password and returns it to the admin. Best practice for security.

**Use Cases:**
- User forgot password
- Emergency account recovery
- Security incident response

#### Request Body

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "forcePasswordChange": true,
  "reason": "User forgot password and requested help"
}
```

#### Parameters

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `userId` | string (UUID) | Yes | - | The ID of the user to reset password for |
| `forcePasswordChange` | boolean | No | `true` | Force user to change password on next login |
| `reason` | string | No | - | Reason for password reset (audit trail, max 500 chars) |

#### Response

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "john.doe@example.com",
  "temporaryPassword": "Xk3@bN9pL2mW",
  "forcePasswordChange": true,
  "changedBy": "admin@susano.dev",
  "changedAt": "2024-11-10T14:30:00.000Z",
  "reason": "User forgot password and requested help"
}
```

#### Curl Example

```bash
curl -X POST "http://localhost:4040/api/admin/users/reset-password" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "forcePasswordChange": true,
    "reason": "User forgot password"
  }'
```

---

### 2. Set User Password (Admin Defined)

**Endpoint:** `POST /admin/users/set-password`

**Description:** Admin sets a specific password for the user. Useful for creating temporary access credentials.

**Use Cases:**
- Emergency access with known password
- Temporary password for specific purpose
- Account setup with initial password

#### Request Body

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "newPassword": "TempSecure@Pass123",
  "forcePasswordChange": true,
  "reason": "Emergency access required for account recovery",
  "sendNotification": false
}
```

#### Parameters

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `userId` | string (UUID) | Yes | - | The ID of the user to set password for |
| `newPassword` | string | Yes | - | New password (must meet security requirements) |
| `forcePasswordChange` | boolean | No | `true` | Force user to change password on next login |
| `reason` | string | No | - | Reason for setting password (audit trail, max 500 chars) |
| `sendNotification` | boolean | No | `false` | Send email notification to user |

#### Password Requirements

- **Minimum length:** 8 characters
- **Maximum length:** 128 characters
- **Must contain:**
  - At least one uppercase letter (A-Z)
  - At least one lowercase letter (a-z)
  - At least one digit (0-9)
  - At least one special character (@$!%*?&)

**Valid examples:**
- `SecurePass@123`
- `MyTemp!Pass99`
- `Admin$2024Pass`

**Invalid examples:**
- `password` (no uppercase, no digit, no special char)
- `PASSWORD123` (no lowercase, no special char)
- `Pass@123` (less than 8 characters)

#### Response

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "john.doe@example.com",
  "forcePasswordChange": true,
  "changedBy": "admin@susano.dev",
  "changedAt": "2024-11-10T14:30:00.000Z",
  "reason": "Emergency access required for account recovery"
}
```

**Note:** The `temporaryPassword` field is NOT returned when setting a password (since admin already knows it).

#### Curl Example

```bash
curl -X POST "http://localhost:4040/api/admin/users/set-password" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "newPassword": "TempSecure@Pass123",
    "forcePasswordChange": true,
    "reason": "Emergency access",
    "sendNotification": false
  }'
```

---

## JavaScript/TypeScript Examples

### Using Axios

```typescript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:4040/api';
const token = localStorage.getItem('accessToken');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// 1. Reset user password (system generates password)
async function resetUserPassword(
  userId: string,
  forcePasswordChange: boolean = true,
  reason?: string
) {
  try {
    const response = await api.post('/admin/users/reset-password', {
      userId,
      forcePasswordChange,
      reason
    });
    
    console.log('Temporary password:', response.data.temporaryPassword);
    return response.data;
  } catch (error) {
    console.error('Failed to reset password:', error);
    throw error;
  }
}

// 2. Set specific password for user
async function setUserPassword(
  userId: string,
  newPassword: string,
  forcePasswordChange: boolean = true,
  reason?: string,
  sendNotification: boolean = false
) {
  try {
    const response = await api.post('/admin/users/set-password', {
      userId,
      newPassword,
      forcePasswordChange,
      reason,
      sendNotification
    });
    
    return response.data;
  } catch (error) {
    console.error('Failed to set password:', error);
    throw error;
  }
}

// 3. Validate password before setting (frontend validation)
function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one digit');
  }
  
  if (!/[@$!%*?&]/.test(password)) {
    errors.push('Password must contain at least one special character (@$!%*?&)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Usage examples:

// Reset with system-generated password
const result1 = await resetUserPassword(
  '550e8400-e29b-41d4-a716-446655440000',
  true,
  'User forgot password'
);
console.log('New temporary password:', result1.temporaryPassword);

// Set specific password
const result2 = await setUserPassword(
  '550e8400-e29b-41d4-a716-446655440000',
  'TempSecure@Pass123',
  true,
  'Emergency access required',
  false
);
console.log('Password changed by:', result2.changedBy);

// Validate password before setting
const validation = validatePassword('MyPass@123');
if (validation.valid) {
  await setUserPassword(userId, 'MyPass@123', true);
} else {
  console.error('Invalid password:', validation.errors);
}
```

---

## React Component Examples

### Password Reset Component

```typescript
import React, { useState } from 'react';
import axios from 'axios';

interface PasswordResetResult {
  userId: string;
  email: string;
  temporaryPassword?: string;
  forcePasswordChange: boolean;
  changedBy: string;
  changedAt: string;
  reason?: string;
}

export function UserPasswordReset({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PasswordResetResult | null>(null);
  const [reason, setReason] = useState('');
  const [forceChange, setForceChange] = useState(true);

  const handleResetPassword = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await axios.post(
        'http://localhost:4040/api/admin/users/reset-password',
        {
          userId,
          forcePasswordChange: forceChange,
          reason: reason || undefined
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Temporary password copied to clipboard!');
  };

  return (
    <div className="password-reset-container">
      <h3>Reset Password for {userEmail}</h3>
      
      {!result ? (
        <>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={forceChange}
                onChange={(e) => setForceChange(e.target.checked)}
              />
              Force user to change password on first login (recommended)
            </label>
          </div>

          <div className="form-group">
            <label>Reason (optional):</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., User forgot password"
              maxLength={500}
            />
          </div>

          <button
            onClick={handleResetPassword}
            disabled={loading}
          >
            {loading ? 'Resetting...' : 'Generate & Reset Password'}
          </button>

          {error && <div className="error">{error}</div>}
        </>
      ) : (
        <div className="success-result">
          <h4>Password Reset Successful!</h4>
          
          <div className="temp-password">
            <label>Temporary Password:</label>
            <div className="password-display">
              <code>{result.temporaryPassword}</code>
              <button onClick={() => copyToClipboard(result.temporaryPassword!)}>
                Copy
              </button>
            </div>
          </div>

          <div className="info">
            <p><strong>User:</strong> {result.email}</p>
            <p><strong>Force Change:</strong> {result.forcePasswordChange ? 'Yes' : 'No'}</p>
            <p><strong>Changed By:</strong> {result.changedBy}</p>
            <p><strong>Changed At:</strong> {new Date(result.changedAt).toLocaleString()}</p>
            {result.reason && <p><strong>Reason:</strong> {result.reason}</p>}
          </div>

          <div className="warning">
            ⚠️ Make sure to securely share this password with the user.
            All their active sessions have been terminated.
          </div>

          <button onClick={() => setResult(null)}>
            Reset Another User
          </button>
        </div>
      )}
    </div>
  );
}
```

### Set Custom Password Component

```typescript
import React, { useState } from 'react';
import axios from 'axios';

interface PasswordSetResult {
  userId: string;
  email: string;
  forcePasswordChange: boolean;
  changedBy: string;
  changedAt: string;
  reason?: string;
}

export function UserPasswordSet({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PasswordSetResult | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [reason, setReason] = useState('');
  const [forceChange, setForceChange] = useState(true);
  const [sendNotification, setSendNotification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    
    if (pwd.length < 8) errors.push('At least 8 characters');
    if (pwd.length > 128) errors.push('Maximum 128 characters');
    if (!/[a-z]/.test(pwd)) errors.push('One lowercase letter');
    if (!/[A-Z]/.test(pwd)) errors.push('One uppercase letter');
    if (!/\d/.test(pwd)) errors.push('One digit');
    if (!/[@$!%*?&]/.test(pwd)) errors.push('One special character (@$!%*?&)');
    
    return errors;
  };

  const passwordErrors = validatePassword(password);
  const isValid = passwordErrors.length === 0 && password === confirmPassword;

  const handleSetPassword = async () => {
    if (!isValid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await axios.post(
        'http://localhost:4040/api/admin/users/set-password',
        {
          userId,
          newPassword: password,
          forcePasswordChange: forceChange,
          reason: reason || undefined,
          sendNotification
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      setResult(response.data);
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-set-container">
      <h3>Set Password for {userEmail}</h3>
      
      {!result ? (
        <>
          <div className="form-group">
            <label>New Password:</label>
            <div className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
              />
              <button onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            
            {password && passwordErrors.length > 0 && (
              <ul className="validation-errors">
                {passwordErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-group">
            <label>Confirm Password:</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
            {confirmPassword && password !== confirmPassword && (
              <span className="error">Passwords do not match</span>
            )}
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={forceChange}
                onChange={(e) => setForceChange(e.target.checked)}
              />
              Force user to change password on first login
            </label>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
              />
              Send email notification to user
            </label>
          </div>

          <div className="form-group">
            <label>Reason (optional):</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Emergency access required"
              maxLength={500}
            />
          </div>

          <button
            onClick={handleSetPassword}
            disabled={loading || !isValid}
          >
            {loading ? 'Setting Password...' : 'Set Password'}
          </button>

          {error && <div className="error">{error}</div>}
        </>
      ) : (
        <div className="success-result">
          <h4>Password Set Successfully!</h4>
          
          <div className="info">
            <p><strong>User:</strong> {result.email}</p>
            <p><strong>Force Change:</strong> {result.forcePasswordChange ? 'Yes' : 'No'}</p>
            <p><strong>Changed By:</strong> {result.changedBy}</p>
            <p><strong>Changed At:</strong> {new Date(result.changedAt).toLocaleString()}</p>
            {result.reason && <p><strong>Reason:</strong> {result.reason}</p>}
          </div>

          <div className="warning">
            ⚠️ All user's active sessions have been terminated.
            User will need to login with the new password.
          </div>

          <button onClick={() => setResult(null)}>
            Set Password for Another User
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Security Behaviors

### Automatic Actions on Password Reset/Set:

1. **Session Invalidation:**
   - All active sessions for the user are immediately terminated
   - User must login again with the new password
   - Prevents unauthorized access with old sessions

2. **Force Password Change:**
   - When enabled (recommended), user MUST change password on next login
   - User cannot access the system until password is changed
   - Provides additional security layer

3. **Audit Trail:**
   - All password changes are logged with:
     - Admin who made the change
     - Timestamp
     - Reason (if provided)
     - User affected
   - Critical severity in audit logs

### Best Practices:

1. **Always use `forcePasswordChange: true`** (recommended for security)
2. **Use reset-password** (system-generated) for maximum security
3. **Use set-password** only when specific password is needed
4. **Provide a reason** for audit trail compliance
5. **Securely communicate** temporary passwords to users
6. **Don't send passwords via email** (use secure channels)

---

## Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```
**Solution:** Provide valid super-admin JWT token

### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Super admin access required",
  "error": "Forbidden"
}
```
**Solution:** User must be super-admin

### 404 User Not Found
```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```
**Solution:** Verify the userId is correct

### 400 Bad Request (Inactive User)
```json
{
  "statusCode": 400,
  "message": "Cannot reset password for inactive user",
  "error": "Bad Request"
}
```
**Solution:** Activate user account first

### 400 Bad Request (Weak Password)
```json
{
  "statusCode": 400,
  "message": [
    "Password must be at least 8 characters long",
    "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)"
  ],
  "error": "Bad Request"
}
```
**Solution:** Use a stronger password that meets all requirements

---

## Summary

- ✅ **Reset Password:** System generates secure 12-character password
- ✅ **Set Password:** Admin defines password (must meet security requirements)
- ✅ **Force Change:** Optional flag to force password change on next login
- ✅ **Audit Trail:** Full logging with reason, admin, and timestamp
- ✅ **Session Invalidation:** All active sessions terminated on password change
- ✅ **Super-Admin Only:** Protected by SuperAdminGuard

Both endpoints are production-ready and follow security best practices.
