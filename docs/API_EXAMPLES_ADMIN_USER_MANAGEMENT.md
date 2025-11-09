# Admin User Management API Examples

Complete reference for super-admin user management operations with practical examples.

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Update User Endpoint](#update-user-endpoint)
- [Request Examples](#request-examples)
- [JavaScript/TypeScript Examples](#javascripttypescript-examples)
- [React Component Examples](#react-component-examples)
- [Error Handling](#error-handling)
- [Security & Audit](#security--audit)
- [Best Practices](#best-practices)

---

## Overview

**Base URL**: `http://localhost:4040/api`

The Admin User Management API allows super-administrators to:
- ✅ Update any user field including sensitive settings
- ✅ Change user roles and permissions
- ✅ Activate/deactivate accounts
- ✅ Lock/unlock user accounts
- ✅ Reset failed login attempts
- ✅ Force password changes
- ✅ Update personal information with validation

**All operations**:
- Are super-admin only (SuperAdminGuard)
- Create HIGH severity audit logs
- Include detailed change tracking
- Validate uniqueness (email, mobile)
- Log with PinoLogger and AuditService

---

## Authentication

All endpoints require JWT authentication with super-admin role.

```bash
# Required header
Authorization: Bearer YOUR_SUPER_ADMIN_JWT_TOKEN
```

**Token Requirement**: Must be authenticated as a user with super-admin privileges. Regular admins and users will receive 403 Forbidden.

---

## Update User Endpoint

### PATCH /admin/users/:userId

Update any user field. All fields are optional - only send fields you want to change.

**Protected by**: `SuperAdminGuard`

**Audit Logging**: HIGH severity with previous/new values

#### Request Body

```typescript
{
  // Personal Information
  name?: string                    // 1-50 chars
  email?: string                   // Valid email, max 50 chars, must be unique
  mobileNumber?: string            // E.164 format (+1234567890), must be unique
  
  // Role & Permissions
  primaryRoleId?: number           // Valid role ID (validated against roles table)
  
  // Account Status
  isActive?: boolean               // Enable/disable account
  isVerified?: boolean             // Mark as verified
  isEmailVerified?: boolean        // Mark email as verified
  
  // Security Settings
  forcePasswordChange?: boolean    // Require password change on next login
  isLocked?: boolean               // Lock/unlock account
  lockReason?: string              // Reason for lock (max 100 chars)
  failedLoginAttempts?: number     // Reset failed login counter (min 0)
  
  // Audit Trail
  reason?: string                  // Reason for this update (max 500 chars)
}
```

#### Response

```typescript
{
  message: "User updated successfully",
  user: {
    id: string
    name: string
    email: string
    mobileNumber: string
    role: string                   // Legacy role name
    primaryRoleId: number
    isActive: boolean
    isVerified: boolean
    isEmailVerified: boolean
    forcePasswordChange: boolean
    isLocked: boolean
    failedLoginAttempts: number
    updatedAt: Date
  },
  updatedBy: string,               // Admin email who made the change
  updatedAt: Date,                 // Timestamp of update
  reason?: string                  // Reason provided (if any)
}
```

#### Status Codes

| Code | Description |
|------|-------------|
| 200 | User updated successfully |
| 400 | Invalid data or role not found |
| 401 | Not authenticated |
| 403 | Not super-admin |
| 404 | User not found |
| 409 | Email or mobile number already in use |

---

## Request Examples

### 1. Update Personal Information

```bash
curl -X PATCH "http://localhost:4040/api/admin/users/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "email": "john.smith@example.com",
    "mobileNumber": "+1234567890",
    "reason": "User requested name change via support ticket #12345"
  }'
```

### 2. Change User Role

```bash
curl -X PATCH "http://localhost:4040/api/admin/users/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "primaryRoleId": 2,
    "reason": "Promoting user to admin role per HR approval"
  }'
```

### 3. Deactivate Account

```bash
curl -X PATCH "http://localhost:4040/api/admin/users/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": false,
    "reason": "Account deactivated per compliance team request - user left company"
  }'
```

### 4. Lock Account (Security Incident)

```bash
curl -X PATCH "http://localhost:4040/api/admin/users/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isLocked": true,
    "lockReason": "SECURITY_VIOLATION",
    "reason": "Multiple suspicious login attempts detected from unusual locations"
  }'
```

### 5. Unlock Account and Reset Failed Logins

```bash
curl -X PATCH "http://localhost:4040/api/admin/users/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isLocked": false,
    "failedLoginAttempts": 0,
    "reason": "User verified identity via phone - resetting account lock"
  }'
```

### 6. Force Password Change

```bash
curl -X PATCH "http://localhost:4040/api/admin/users/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "forcePasswordChange": true,
    "reason": "Security policy - forcing password rotation after 90 days"
  }'
```

### 7. Verify User and Email

```bash
curl -X PATCH "http://localhost:4040/api/admin/users/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "isVerified": true,
    "isEmailVerified": true,
    "reason": "Manual verification - user provided ID documents"
  }'
```

### 8. Comprehensive Update (Multiple Fields)

```bash
curl -X PATCH "http://localhost:4040/api/admin/users/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane.doe@company.com",
    "primaryRoleId": 3,
    "isActive": true,
    "isVerified": true,
    "isEmailVerified": true,
    "forcePasswordChange": false,
    "reason": "Onboarding new team lead - setting up verified admin account"
  }'
```

---

## JavaScript/TypeScript Examples

### API Client with Axios

```typescript
import axios from 'axios'

const API_BASE_URL = 'http://localhost:4040/api'

interface AdminUpdateUserRequest {
  name?: string
  email?: string
  mobileNumber?: string
  primaryRoleId?: number
  isActive?: boolean
  isVerified?: boolean
  isEmailVerified?: boolean
  forcePasswordChange?: boolean
  isLocked?: boolean
  lockReason?: string
  failedLoginAttempts?: number
  reason?: string
}

interface AdminUpdateUserResponse {
  message: string
  user: {
    id: string
    name: string
    email: string
    mobileNumber: string
    role: string
    primaryRoleId: number
    isActive: boolean
    isVerified: boolean
    isEmailVerified: boolean
    forcePasswordChange: boolean
    isLocked: boolean
    failedLoginAttempts: number
    updatedAt: Date
  }
  updatedBy: string
  updatedAt: Date
  reason?: string
}

/**
 * Update user by super-admin
 */
export async function updateUser(
  userId: string,
  data: AdminUpdateUserRequest,
  token: string
): Promise<AdminUpdateUserResponse> {
  const response = await axios.patch(
    `${API_BASE_URL}/admin/users/${userId}`,
    data,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  )
  return response.data
}

/**
 * Update user personal information
 */
export async function updateUserInfo(
  userId: string,
  name: string,
  email: string,
  mobile: string,
  reason: string,
  token: string
): Promise<AdminUpdateUserResponse> {
  return updateUser(
    userId,
    { name, email, mobileNumber: mobile, reason },
    token
  )
}

/**
 * Change user role
 */
export async function changeUserRole(
  userId: string,
  roleId: number,
  reason: string,
  token: string
): Promise<AdminUpdateUserResponse> {
  return updateUser(userId, { primaryRoleId: roleId, reason }, token)
}

/**
 * Activate/Deactivate user account
 */
export async function setAccountStatus(
  userId: string,
  isActive: boolean,
  reason: string,
  token: string
): Promise<AdminUpdateUserResponse> {
  return updateUser(userId, { isActive, reason }, token)
}

/**
 * Lock user account
 */
export async function lockAccount(
  userId: string,
  lockReason: string,
  adminReason: string,
  token: string
): Promise<AdminUpdateUserResponse> {
  return updateUser(
    userId,
    { isLocked: true, lockReason, reason: adminReason },
    token
  )
}

/**
 * Unlock user account and reset failed logins
 */
export async function unlockAccount(
  userId: string,
  reason: string,
  token: string
): Promise<AdminUpdateUserResponse> {
  return updateUser(
    userId,
    { isLocked: false, failedLoginAttempts: 0, reason },
    token
  )
}

/**
 * Force password change on next login
 */
export async function forcePasswordChange(
  userId: string,
  reason: string,
  token: string
): Promise<AdminUpdateUserResponse> {
  return updateUser(userId, { forcePasswordChange: true, reason }, token)
}

/**
 * Verify user and email
 */
export async function verifyUser(
  userId: string,
  reason: string,
  token: string
): Promise<AdminUpdateUserResponse> {
  return updateUser(
    userId,
    { isVerified: true, isEmailVerified: true, reason },
    token
  )
}

// Example usage
async function example() {
  const token = 'your-super-admin-token'
  const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

  try {
    // Update personal info
    const result = await updateUserInfo(
      userId,
      'John Doe',
      'john@example.com',
      '+1234567890',
      'User requested update via support',
      token
    )
    console.log('User updated:', result.user)
    console.log('Updated by:', result.updatedBy)

    // Change role
    const roleResult = await changeUserRole(
      userId,
      2,
      'Promotion to admin',
      token
    )
    console.log('Role changed:', roleResult.user.primaryRoleId)

    // Lock account
    const lockResult = await lockAccount(
      userId,
      'SECURITY_VIOLATION',
      'Suspicious activity detected',
      token
    )
    console.log('Account locked:', lockResult.user.isLocked)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error('Error:', error.response.status, error.response.data)
    } else {
      console.error('Unexpected error:', error)
    }
  }
}
```

### Validation Helpers

```typescript
/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 50
}

/**
 * Validate mobile number (E.164 format)
 */
export function isValidMobile(mobile: string): boolean {
  const mobileRegex = /^\+?[1-9]\d{1,14}$/
  return mobileRegex.test(mobile) && mobile.length <= 50
}

/**
 * Validate name
 */
export function isValidName(name: string): boolean {
  return name.length >= 1 && name.length <= 50
}

/**
 * Validate reason
 */
export function isValidReason(reason: string): boolean {
  return reason.length <= 500
}

/**
 * Validate lock reason
 */
export function isValidLockReason(reason: string): boolean {
  return reason.length <= 100
}

/**
 * Pre-validate update request
 */
export function validateUpdateRequest(
  data: AdminUpdateUserRequest
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (data.name !== undefined && !isValidName(data.name)) {
    errors.push('Name must be 1-50 characters')
  }

  if (data.email !== undefined && !isValidEmail(data.email)) {
    errors.push('Invalid email format or too long (max 50 chars)')
  }

  if (data.mobileNumber !== undefined && !isValidMobile(data.mobileNumber)) {
    errors.push('Invalid mobile number format (use E.164 international format)')
  }

  if (data.primaryRoleId !== undefined && data.primaryRoleId < 1) {
    errors.push('Role ID must be a positive number')
  }

  if (data.failedLoginAttempts !== undefined && data.failedLoginAttempts < 0) {
    errors.push('Failed login attempts cannot be negative')
  }

  if (data.lockReason !== undefined && !isValidLockReason(data.lockReason)) {
    errors.push('Lock reason too long (max 100 chars)')
  }

  if (data.reason !== undefined && !isValidReason(data.reason)) {
    errors.push('Reason too long (max 500 chars)')
  }

  return { valid: errors.length === 0, errors }
}
```

---

## React Component Examples

### 1. User Edit Form Component

```tsx
import React, { useState } from 'react'
import { updateUser, validateUpdateRequest } from './api-client'

interface UserEditFormProps {
  userId: string
  currentUser: {
    name: string
    email: string
    mobileNumber: string
    primaryRoleId: number
    isActive: boolean
    isVerified: boolean
    isEmailVerified: boolean
    forcePasswordChange: boolean
    isLocked: boolean
    failedLoginAttempts: number
  }
  availableRoles: Array<{ id: number; name: string }>
  token: string
  onSuccess: () => void
  onCancel: () => void
}

export const UserEditForm: React.FC<UserEditFormProps> = ({
  userId,
  currentUser,
  availableRoles,
  token,
  onSuccess,
  onCancel
}) => {
  const [formData, setFormData] = useState({
    name: currentUser.name,
    email: currentUser.email,
    mobileNumber: currentUser.mobileNumber,
    primaryRoleId: currentUser.primaryRoleId,
    isActive: currentUser.isActive,
    isVerified: currentUser.isVerified,
    isEmailVerified: currentUser.isEmailVerified,
    forcePasswordChange: currentUser.forcePasswordChange,
    isLocked: currentUser.isLocked,
    failedLoginAttempts: currentUser.failedLoginAttempts,
    reason: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setValidationErrors([])

    // Build update object with only changed fields
    const updates: any = {}
    if (formData.name !== currentUser.name) updates.name = formData.name
    if (formData.email !== currentUser.email) updates.email = formData.email
    if (formData.mobileNumber !== currentUser.mobileNumber) {
      updates.mobileNumber = formData.mobileNumber
    }
    if (formData.primaryRoleId !== currentUser.primaryRoleId) {
      updates.primaryRoleId = formData.primaryRoleId
    }
    if (formData.isActive !== currentUser.isActive) {
      updates.isActive = formData.isActive
    }
    if (formData.isVerified !== currentUser.isVerified) {
      updates.isVerified = formData.isVerified
    }
    if (formData.isEmailVerified !== currentUser.isEmailVerified) {
      updates.isEmailVerified = formData.isEmailVerified
    }
    if (formData.forcePasswordChange !== currentUser.forcePasswordChange) {
      updates.forcePasswordChange = formData.forcePasswordChange
    }
    if (formData.isLocked !== currentUser.isLocked) {
      updates.isLocked = formData.isLocked
    }
    if (formData.failedLoginAttempts !== currentUser.failedLoginAttempts) {
      updates.failedLoginAttempts = formData.failedLoginAttempts
    }
    if (formData.reason) updates.reason = formData.reason

    // Validate
    const validation = validateUpdateRequest(updates)
    if (!validation.valid) {
      setValidationErrors(validation.errors)
      return
    }

    if (Object.keys(updates).length === 0 || (Object.keys(updates).length === 1 && updates.reason)) {
      setError('No changes detected')
      return
    }

    if (!updates.reason) {
      setError('Please provide a reason for this update')
      return
    }

    try {
      setLoading(true)
      await updateUser(userId, updates, token)
      onSuccess()
    } catch (err: any) {
      if (err.response?.data?.message) {
        setError(err.response.data.message)
      } else {
        setError('Failed to update user')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-2xl font-bold">Edit User</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <ul className="list-disc list-inside">
            {validationErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Personal Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Personal Information</h3>
        
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            maxLength={50}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            maxLength={50}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Mobile Number (E.164 format)
          </label>
          <input
            type="tel"
            value={formData.mobileNumber}
            onChange={e => setFormData({ ...formData, mobileNumber: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            placeholder="+1234567890"
            maxLength={50}
          />
        </div>
      </div>

      {/* Role */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Role</h3>
        <select
          value={formData.primaryRoleId}
          onChange={e => setFormData({ ...formData, primaryRoleId: Number(e.target.value) })}
          className="w-full px-3 py-2 border rounded"
        >
          {availableRoles.map(role => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>

      {/* Account Status */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Account Status</h3>
        
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
          />
          <span>Active</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={formData.isVerified}
            onChange={e => setFormData({ ...formData, isVerified: e.target.checked })}
          />
          <span>Verified</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={formData.isEmailVerified}
            onChange={e => setFormData({ ...formData, isEmailVerified: e.target.checked })}
          />
          <span>Email Verified</span>
        </label>
      </div>

      {/* Security Settings */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Security Settings</h3>
        
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={formData.forcePasswordChange}
            onChange={e => setFormData({ ...formData, forcePasswordChange: e.target.checked })}
          />
          <span>Force Password Change</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={formData.isLocked}
            onChange={e => setFormData({ ...formData, isLocked: e.target.checked })}
          />
          <span>Locked</span>
        </label>

        <div>
          <label className="block text-sm font-medium mb-1">
            Failed Login Attempts
          </label>
          <input
            type="number"
            value={formData.failedLoginAttempts}
            onChange={e => setFormData({ ...formData, failedLoginAttempts: Number(e.target.value) })}
            className="w-full px-3 py-2 border rounded"
            min="0"
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Reason for Update <span className="text-red-500">*</span>
        </label>
        <textarea
          value={formData.reason}
          onChange={e => setFormData({ ...formData, reason: e.target.value })}
          className="w-full px-3 py-2 border rounded"
          rows={3}
          maxLength={500}
          placeholder="Explain why you're making this update (required for audit trail)"
        />
        <div className="text-sm text-gray-500 mt-1">
          {formData.reason.length}/500 characters
        </div>
      </div>

      {/* Actions */}
      <div className="flex space-x-3">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update User'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

### 2. Quick Action Buttons Component

```tsx
import React, { useState } from 'react'
import {
  setAccountStatus,
  lockAccount,
  unlockAccount,
  forcePasswordChange,
  verifyUser
} from './api-client'

interface QuickActionsProps {
  userId: string
  currentStatus: {
    isActive: boolean
    isLocked: boolean
    isVerified: boolean
  }
  token: string
  onActionComplete: () => void
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  userId,
  currentStatus,
  token,
  onActionComplete
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAction = async (
    action: () => Promise<any>,
    successMessage: string
  ) => {
    setError(null)
    setLoading(true)

    try {
      await action()
      alert(successMessage)
      onActionComplete()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Quick Actions</h3>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            handleAction(
              () => setAccountStatus(userId, !currentStatus.isActive, 
                `Quick ${currentStatus.isActive ? 'deactivation' : 'activation'} by admin`, token),
              `Account ${currentStatus.isActive ? 'deactivated' : 'activated'}`
            )
          }
          disabled={loading}
          className={`px-3 py-1 rounded text-sm ${
            currentStatus.isActive
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          {currentStatus.isActive ? 'Deactivate' : 'Activate'}
        </button>

        <button
          onClick={() =>
            handleAction(
              () => currentStatus.isLocked
                ? unlockAccount(userId, 'Admin unlocked account', token)
                : lockAccount(userId, 'ADMIN_LOCK', 'Admin locked account', token),
              `Account ${currentStatus.isLocked ? 'unlocked' : 'locked'}`
            )
          }
          disabled={loading}
          className={`px-3 py-1 rounded text-sm ${
            currentStatus.isLocked
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
          }`}
        >
          {currentStatus.isLocked ? 'Unlock' : 'Lock'}
        </button>

        {!currentStatus.isVerified && (
          <button
            onClick={() =>
              handleAction(
                () => verifyUser(userId, 'Admin manual verification', token),
                'User verified'
              )
            }
            disabled={loading}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
          >
            Verify User
          </button>
        )}

        <button
          onClick={() =>
            handleAction(
              () => forcePasswordChange(userId, 'Admin requested password change', token),
              'Password change will be required on next login'
            )
          }
          disabled={loading}
          className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200"
        >
          Force Password Change
        </button>
      </div>
    </div>
  )
}
```

---

## Error Handling

### Common Errors

#### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```
**Solution**: Verify JWT token is valid and not expired.

#### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```
**Solution**: Ensure authenticated user has super-admin role. Regular admins cannot access this endpoint.

#### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "User with ID a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11 not found"
}
```
**Solution**: Verify the user ID exists in the database.

#### 400 Bad Request - Invalid Role
```json
{
  "statusCode": 400,
  "message": "Role with ID 999 not found"
}
```
**Solution**: Verify the role ID exists. Fetch available roles first.

#### 409 Conflict - Email Already Exists
```json
{
  "statusCode": 409,
  "message": "Email john@example.com is already in use"
}
```
**Solution**: Choose a different email or check if the user already has an account.

#### 409 Conflict - Mobile Already Exists
```json
{
  "statusCode": 409,
  "message": "Mobile number +1234567890 is already in use"
}
```
**Solution**: Choose a different mobile number.

#### 400 Bad Request - Validation Error
```json
{
  "statusCode": 400,
  "message": [
    "name must be longer than or equal to 1 characters",
    "email must be an email",
    "mobileNumber must match /^\\+?[1-9]\\d{1,14}$/ regular expression"
  ],
  "error": "Bad Request"
}
```
**Solution**: Fix validation errors in request data.

---

## Security & Audit

### Audit Logging

Every user update creates a HIGH severity audit log with:

**Logged Information**:
- **Admin**: Who made the change (userId, email)
- **Target**: Which user was modified (userId, email)
- **Changes**: Previous and new values for all modified fields
- **Reason**: Administrative justification
- **Metadata**: Change count, timestamp, context

**Audit Log Entry Example**:
```typescript
{
  userId: "admin-uuid",
  username: "admin",
  email: "admin@kuybi.dev",
  action: "UPDATE",
  entityType: "User",
  entityId: "user-uuid",
  previousValues: {
    name: "John Doe",
    email: "john@old.com",
    isActive: true
  },
  newValues: {
    name: "Jane Doe",
    email: "jane@new.com",
    isActive: false
  },
  severity: "HIGH",
  description: "Super-admin updated user john@old.com: name changed, email changed, isActive changed",
  metadata: {
    targetUserId: "user-uuid",
    targetUserEmail: "john@old.com",
    reason: "User requested name and email change",
    changesCount: 3
  },
  timestamp: "2025-11-10T12:00:00.000Z"
}
```

### PinoLogger Output

All updates also log to application logs:
```json
{
  "level": "warn",
  "action": "admin_update_user",
  "userId": "user-uuid",
  "userEmail": "john@old.com",
  "adminId": "admin-uuid",
  "adminEmail": "admin@kuybi.dev",
  "changes": [
    "name changed from John Doe to Jane Doe",
    "email changed from john@old.com to jane@new.com",
    "isActive changed from true to false"
  ],
  "reason": "User requested name and email change"
}
```

### Security Features

1. **Super-Admin Only**: Protected by `SuperAdminGuard`
2. **Unique Validation**: Email and mobile checked for duplicates
3. **Role Validation**: Ensures role ID exists before assignment
4. **Change Tracking**: Only modified fields are updated
5. **Audit Trail**: Complete history with reasons
6. **Lock Management**: Automatic timestamp updates for locks
7. **No Password Exposure**: Password fields never returned in response

---

## Best Practices

### 1. Always Provide a Reason
```typescript
// ❌ Bad - No reason
await updateUser(userId, { isActive: false }, token)

// ✅ Good - Clear reason for audit trail
await updateUser(
  userId,
  {
    isActive: false,
    reason: 'Account deactivated per HR request - user terminated'
  },
  token
)
```

### 2. Validate Before Sending
```typescript
// Pre-validate to provide better UX
const validation = validateUpdateRequest(updateData)
if (!validation.valid) {
  // Show errors to user before making API call
  showErrors(validation.errors)
  return
}

// Then make API call
await updateUser(userId, updateData, token)
```

### 3. Only Send Changed Fields
```typescript
// Build update object with only modified fields
const updates: AdminUpdateUserRequest = {}
if (newName !== currentName) updates.name = newName
if (newEmail !== currentEmail) updates.email = newEmail
// ... only changed fields

if (Object.keys(updates).length > 0) {
  updates.reason = reason
  await updateUser(userId, updates, token)
}
```

### 4. Handle Conflicts Gracefully
```typescript
try {
  await updateUser(userId, { email: newEmail }, token)
} catch (error) {
  if (error.response?.status === 409) {
    // Show user-friendly message
    alert('This email is already registered. Please use a different email.')
  } else {
    // Handle other errors
    alert('Failed to update user')
  }
}
```

### 5. Lock/Unlock Pattern
```typescript
// When locking, always provide reason
if (shouldLock) {
  await updateUser(userId, {
    isLocked: true,
    lockReason: 'SECURITY_VIOLATION',
    reason: 'Multiple failed login attempts from suspicious IPs'
  }, token)
}

// When unlocking, reset failed attempts
if (shouldUnlock) {
  await updateUser(userId, {
    isLocked: false,
    failedLoginAttempts: 0,
    reason: 'User identity verified via phone call'
  }, token)
}
```

### 6. Role Changes
```typescript
// Fetch available roles first
const roles = await getRoles(token)

// Validate role exists before updating
const roleExists = roles.some(r => r.id === newRoleId)
if (!roleExists) {
  alert('Invalid role selected')
  return
}

await updateUser(userId, {
  primaryRoleId: newRoleId,
  reason: `Role changed to ${roles.find(r => r.id === newRoleId)?.name} per HR approval`
}, token)
```

### 7. Comprehensive Updates
```typescript
// When making multiple changes, include all in one request
await updateUser(userId, {
  name: 'Jane Doe',
  email: 'jane@company.com',
  primaryRoleId: 3,
  isActive: true,
  isVerified: true,
  isEmailVerified: true,
  forcePasswordChange: false,
  reason: 'Onboarding new team lead with verified credentials'
}, token)
```

### 8. Error Boundaries
```typescript
// Wrap update operations in try-catch with specific error handling
async function safeUpdateUser(userId: string, data: AdminUpdateUserRequest, token: string) {
  try {
    return await updateUser(userId, data, token)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      switch (error.response?.status) {
        case 401:
          // Redirect to login
          window.location.href = '/login'
          break
        case 403:
          alert('You do not have permission to perform this action')
          break
        case 404:
          alert('User not found')
          break
        case 409:
          alert('Email or mobile number already in use')
          break
        default:
          alert('An error occurred while updating the user')
      }
    }
    throw error
  }
}
```

---

## Related Endpoints

- **POST /admin/users/reset-password** - Reset user password (system-generated)
- **POST /admin/users/set-password** - Set user password (admin-defined)
- **GET /v1/users** - List users with filtering
- **GET /v1/users/:id** - Get user details
- **GET /v1/roles** - List available roles

---

## Summary

The Admin User Management API provides comprehensive user administration with:

✅ **Flexible Updates**: Modify any user field including sensitive settings  
✅ **Role Management**: Change user roles with validation  
✅ **Account Control**: Activate, deactivate, lock, unlock accounts  
✅ **Security Enforcement**: Force password changes, reset failed attempts  
✅ **Complete Audit Trail**: HIGH severity logs with detailed change tracking  
✅ **Validation**: Email/mobile uniqueness, role existence checks  
✅ **Safe Operations**: Only super-admins can execute updates  

All operations are logged for compliance and security auditing with full context of who, what, when, and why changes were made.
