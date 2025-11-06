# Change Password Feature - Enhanced Security Options

## 📋 Overview

Enhanced password change endpoint with granular control over session management and security notifications.

**Endpoint**: `POST /api/v1/auth/change-password`

**Authentication**: Required (JWT Bearer token)

**Rate Limit**: 5 attempts per 5 minutes

---

## 🔐 Features

### 1. **Session Invalidation Control** (NEW)

Users can now control whether changing their password logs them out of other devices.

**Options:**
- `invalidateAllSessions: true` (default) - Logs out all other devices, keeps current session
- `invalidateAllSessions: false` - Keeps all sessions active

**Use Cases:**
- **True**: Security-conscious users who want to ensure no one else has access
- **False**: Convenience for users who trust their other logged-in devices

### 2. **Email Notifications** (NEW)

Automatically notify users when their password is changed for security monitoring.

**Options:**
- `sendNotificationEmail: true` (default) - Sends email notification
- `sendNotificationEmail: false` - Silent password change

**Email Contains:**
- Timestamp of change
- IP address of request
- User agent (browser/device)
- Number of sessions invalidated
- Action to take if change was unauthorized

### 3. **Password Validation**

- ✅ Minimum 8 characters
- ✅ At least one uppercase letter
- ✅ At least one lowercase letter
- ✅ At least one number
- ✅ At least one special character (@$!%*?&)
- ✅ Cannot reuse current password
- ✅ Passwords must match (confirmation)

### 4. **Audit Trail**

All password changes are logged with:
- User ID and email
- IP address
- User agent
- Timestamp
- Session invalidation preference
- Notification preference
- Number of sessions revoked

---

## 📡 API Request/Response

### Request Body

```json
{
  "currentPassword": "OldPass@123",
  "newPassword": "NewSecure@Pass456",
  "confirmPassword": "NewSecure@Pass456",
  "invalidateAllSessions": true,
  "sendNotificationEmail": true
}
```

### Field Descriptions

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `currentPassword` | string | ✅ Yes | - | Current password for verification |
| `newPassword` | string | ✅ Yes | - | New password (must meet strength requirements) |
| `confirmPassword` | string | ✅ Yes | - | Password confirmation (must match newPassword) |
| `invalidateAllSessions` | boolean | ❌ No | `true` | Log out of all other devices |
| `sendNotificationEmail` | boolean | ❌ No | `true` | Send email notification about change |

### Success Response (200 OK)

```json
{
  "message": "Password changed successfully. Other sessions have been logged out.",
  "success": true,
  "sessionsRevoked": 3,
  "notificationSent": true
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Human-readable success message |
| `success` | boolean | Always `true` on success |
| `sessionsRevoked` | number | Number of other sessions that were invalidated |
| `notificationSent` | boolean | Whether email notification was sent |

### Error Responses

**401 Unauthorized - Current Password Incorrect**
```json
{
  "statusCode": 401,
  "message": "Current password is incorrect",
  "error": "Unauthorized"
}
```

**401 Unauthorized - Password Reuse**
```json
{
  "statusCode": 401,
  "message": "New password must be different from current password",
  "error": "Unauthorized"
}
```

**401 Unauthorized - Passwords Don't Match**
```json
{
  "statusCode": 401,
  "message": "New password and confirmation do not match",
  "error": "Unauthorized"
}
```

**400 Bad Request - Weak Password**
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

---

## 💡 Usage Examples

### Example 1: High Security (Log out all devices)

**Scenario**: User suspects account compromise

```bash
curl -X POST http://localhost:4040/api/v1/auth/change-password \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "OldPass@123",
    "newPassword": "NewSecure@Pass456",
    "confirmPassword": "NewSecure@Pass456",
    "invalidateAllSessions": true,
    "sendNotificationEmail": true
  }'
```

**Response:**
```json
{
  "message": "Password changed successfully. Other sessions have been logged out.",
  "success": true,
  "sessionsRevoked": 5,
  "notificationSent": true
}
```

**Result**: 
- ✅ Password updated
- ✅ Current session still active (can continue using app)
- ✅ 5 other devices logged out
- ✅ Email sent to user's email address

---

### Example 2: Convenience Mode (Keep all sessions)

**Scenario**: User changing password voluntarily, trusts all devices

```bash
curl -X POST http://localhost:4040/api/v1/auth/change-password \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "OldPass@123",
    "newPassword": "NewSecure@Pass456",
    "confirmPassword": "NewSecure@Pass456",
    "invalidateAllSessions": false,
    "sendNotificationEmail": true
  }'
```

**Response:**
```json
{
  "message": "Password changed successfully. All sessions remain active.",
  "success": true,
  "sessionsRevoked": 0,
  "notificationSent": true
}
```

**Result**:
- ✅ Password updated
- ✅ All sessions (laptop, phone, tablet) remain logged in
- ✅ Email notification sent
- ✅ No re-login required on any device

---

### Example 3: Silent Change (No notifications)

**Scenario**: Automated password rotation, no email needed

```bash
curl -X POST http://localhost:4040/api/v1/auth/change-password \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "OldPass@123",
    "newPassword": "NewSecure@Pass456",
    "confirmPassword": "NewSecure@Pass456",
    "invalidateAllSessions": false,
    "sendNotificationEmail": false
  }'
```

**Response:**
```json
{
  "message": "Password changed successfully. All sessions remain active.",
  "success": true,
  "sessionsRevoked": 0,
  "notificationSent": false
}
```

---

## 🔒 Security Considerations

### ✅ Best Practices

1. **Always use `invalidateAllSessions: true`** when:
   - Password was compromised
   - Suspicious activity detected
   - User received unauthorized login alerts
   - Security incident reported

2. **Use `invalidateAllSessions: false`** only when:
   - Voluntary password change
   - User trusts all logged-in devices
   - Convenience outweighs security risk

3. **Keep `sendNotificationEmail: true`** for:
   - Security monitoring
   - Alerting user to unauthorized changes
   - Audit trail documentation

### 🚨 Security Features

- **Rate Limiting**: 5 attempts per 5 minutes per user
- **Current Password Required**: Prevents unauthorized changes
- **Password Strength Validation**: Enforces strong passwords
- **Audit Logging**: All changes logged with context
- **Session Management**: Granular control over active sessions
- **No Password Reuse**: Prevents using same password

---

## 🎯 Frontend Integration Guide

### React/TypeScript Example

```typescript
interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
  confirmPassword: string
  invalidateAllSessions?: boolean
  sendNotificationEmail?: boolean
}

interface ChangePasswordResponse {
  message: string
  success: boolean
  sessionsRevoked: number
  notificationSent: boolean
}

async function changePassword(
  data: ChangePasswordRequest,
  token: string
): Promise<ChangePasswordResponse> {
  const response = await fetch('http://localhost:4040/api/v1/auth/change-password', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
      confirmPassword: data.confirmPassword,
      invalidateAllSessions: data.invalidateAllSessions ?? true,
      sendNotificationEmail: data.sendNotificationEmail ?? true
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Password change failed')
  }

  return response.json()
}

// Usage
try {
  const result = await changePassword({
    currentPassword: 'OldPass@123',
    newPassword: 'NewSecure@Pass456',
    confirmPassword: 'NewSecure@Pass456',
    invalidateAllSessions: true,
    sendNotificationEmail: true
  }, userToken)

  console.log(result.message) // "Password changed successfully. Other sessions have been logged out."
  console.log(`${result.sessionsRevoked} sessions revoked`)
} catch (error) {
  console.error('Password change failed:', error.message)
}
```

### UI Recommendations

**Form Fields:**
```jsx
<form onSubmit={handleSubmit}>
  <input type="password" name="currentPassword" placeholder="Current Password" required />
  <input type="password" name="newPassword" placeholder="New Password" required />
  <input type="password" name="confirmPassword" placeholder="Confirm Password" required />
  
  <label>
    <input type="checkbox" name="invalidateAllSessions" defaultChecked />
    Log out of all other devices (recommended for security)
  </label>
  
  <label>
    <input type="checkbox" name="sendNotificationEmail" defaultChecked />
    Send me an email notification
  </label>
  
  <button type="submit">Change Password</button>
</form>
```

**User Feedback:**
```jsx
// Show result to user
if (result.sessionsRevoked > 0) {
  showNotification(
    `Password changed! ${result.sessionsRevoked} other device(s) logged out.`,
    'success'
  )
} else {
  showNotification(
    'Password changed successfully. All your devices remain logged in.',
    'success'
  )
}
```

---

## 📊 Monitoring & Analytics

### Metrics to Track

1. **Session Invalidation Rate**
   - % of users who keep `invalidateAllSessions: true`
   - Indicates security awareness

2. **Email Notification Opt-out Rate**
   - % of users who disable notifications
   - May indicate notification fatigue

3. **Password Change Frequency**
   - Average days between password changes
   - Helps detect forced rotation policies

4. **Failed Attempts Rate**
   - Wrong current password attempts
   - May indicate account takeover attempts

### Audit Log Queries

```sql
-- Password changes in last 24 hours
SELECT * FROM audit_logs 
WHERE action = 'password_change' 
AND created_at > NOW() - INTERVAL '24 hours';

-- Users who keep all sessions active
SELECT user_id, COUNT(*) as change_count
FROM audit_logs
WHERE action = 'password_changed_sessions_kept'
GROUP BY user_id
ORDER BY change_count DESC;

-- Suspicious rapid password changes
SELECT user_id, COUNT(*) as changes, MAX(created_at) as last_change
FROM audit_logs
WHERE action = 'password_change'
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 3;
```

---

## 🚀 Future Enhancements

### Planned Features

1. **Password History** 🔒
   - Prevent reusing last N passwords (e.g., last 5)
   - Implement password history table
   - Check against historical hashes

2. **Two-Factor Authentication** 🔐
   - Require OTP/2FA before password change
   - Extra security for sensitive operations
   - Configurable per user or globally

3. **Password Strength Indicator** 💪
   - Real-time password strength feedback
   - Suggestions for improvement
   - Visual indicator (weak/medium/strong)

4. **Breach Detection** 🚨
   - Check password against known breach databases
   - Warn users if password appears in leaks
   - Integration with HaveIBeenPwned API

5. **Smart Session Management** 🤖
   - Auto-detect suspicious sessions
   - Suggest which sessions to revoke
   - Show last activity per device

6. **Email Notification Template** 📧
   - Rich HTML email with details
   - Quick action buttons (lock account, contact support)
   - Branded template

---

## 🧪 Testing

### Test Cases

1. **Valid Password Change**
   - ✅ Current password correct
   - ✅ New password meets requirements
   - ✅ Passwords match
   - ✅ Sessions invalidated as requested

2. **Invalid Current Password**
   - ❌ Should return 401 Unauthorized
   - ❌ Should not change password

3. **Weak New Password**
   - ❌ Should return 400 Bad Request
   - ❌ Should list validation errors

4. **Password Reuse**
   - ❌ Should reject if new = current
   - ❌ Should return 401 Unauthorized

5. **Mismatched Confirmation**
   - ❌ Should reject if newPassword ≠ confirmPassword
   - ❌ Should return 401 Unauthorized

6. **Session Management**
   - ✅ Current session stays active
   - ✅ Other sessions revoked when requested
   - ✅ All sessions stay active when requested

7. **Rate Limiting**
   - ❌ Should block after 5 attempts in 5 minutes
   - ✅ Should allow after cooldown period

### Manual Testing Script

```bash
# Test 1: Successful change with session invalidation
curl -X POST http://localhost:4040/api/v1/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"Test@123","newPassword":"NewTest@456","confirmPassword":"NewTest@456","invalidateAllSessions":true}'

# Test 2: Successful change keeping sessions
curl -X POST http://localhost:4040/api/v1/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"NewTest@456","newPassword":"AnotherTest@789","confirmPassword":"AnotherTest@789","invalidateAllSessions":false}'

# Test 3: Wrong current password
curl -X POST http://localhost:4040/api/v1/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"WrongPass@123","newPassword":"NewTest@456","confirmPassword":"NewTest@456"}'

# Test 4: Weak password
curl -X POST http://localhost:4040/api/v1/auth/change-password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"AnotherTest@789","newPassword":"weak","confirmPassword":"weak"}'
```

---

## 📝 Migration Notes

### Breaking Changes

**Before** (Old API):
```json
{
  "currentPassword": "old",
  "newPassword": "new",
  "confirmPassword": "new"
}
// Always invalidated ALL sessions including current
```

**After** (New API):
```json
{
  "currentPassword": "old",
  "newPassword": "new",
  "confirmPassword": "new",
  "invalidateAllSessions": true,  // NEW (default: true, keeps current session)
  "sendNotificationEmail": true   // NEW (default: true)
}
// More granular control, current session stays active
```

### Backward Compatibility

✅ **Fully backward compatible**
- Old requests work exactly as before
- New fields are optional with sensible defaults
- Default behavior: invalidate all OTHER sessions (not current)
- No client changes required

---

## 📚 Related Documentation

- [Authentication Guide](./AUTHENTICATION.md)
- [Session Management](./SESSION_MANAGEMENT.md)
- [Password Reset Flow](./PASSWORD_RESET.md)
- [Security Best Practices](../security/BEST_PRACTICES.md)
- [Audit Logging](../audit/AUDIT_LOGGING.md)

---

**Last Updated**: November 6, 2025  
**Version**: 1.0.0  
**Status**: ✅ Production Ready
