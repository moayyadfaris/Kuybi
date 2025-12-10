# ACL (Access Control List) API Guide for Dashboard

## Overview

The Kuybi platform uses a sophisticated Role-Based Access Control (RBAC) system with CASL (Code Access Security Layer) for fine-grained permissions. This guide will help you integrate ACL features into the frontend dashboard.

## Table of Contents

- [Authentication Flow](#authentication-flow)
- [Role Hierarchy](#role-hierarchy)
- [Available Endpoints](#available-endpoints)
- [Permission Structure](#permission-structure)
- [Frontend Integration Examples](#frontend-integration-examples)
- [Common Use Cases](#common-use-cases)

---

## Authentication Flow

### 1. Login
```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@kuybi.dev",
  "password": "Admin@123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "name": "Admin User",
      "email": "admin@kuybi.dev",
      "primaryRole": {
        "id": 1,
        "name": "super_admin",
        "displayName": "Super Admin"
      }
    }
  }
}
```

### 2. Use Access Token

Include the token in all subsequent requests:
```bash
Authorization: Bearer <accessToken>
```

---

## Role Hierarchy

The system has 5 predefined roles with hierarchical permissions:

| Role | ID | Level | Description |
|------|-----|-------|-------------|
| **Super Admin** | 1 | 5 | Full system access, can manage everything |
| **Admin** | 2 | 4 | Manage users, content, and settings |
| **Editor** | 3 | 3 | Create and publish content |
| **Moderator** | 4 | 2 | Review and moderate content |
| **User** | 5 | 1 | Basic read access |

**Hierarchy Rule**: Higher-level roles inherit permissions from lower-level roles.

---

## Available Endpoints

### Base URL
```
http://localhost:4040/api/v1
```

### Roles Management

#### 1. Get All Roles
```bash
GET /api/v1/roles
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "super_admin",
      "displayName": "Super Admin",
      "description": "Full system access",
      "level": 5,
      "isSystem": true,
      "permissions": [
        {
          "id": 1,
          "action": "manage",
          "subject": "all"
        }
      ]
    },
    {
      "id": 2,
      "name": "admin",
      "displayName": "Admin",
      "level": 4,
      "permissions": [...]
    }
  ]
}
```

#### 2. Get Single Role
```bash
GET /api/v1/roles/:id
Authorization: Bearer <token>
```

#### 3. Create Role (Super Admin only)
```bash
POST /api/v1/roles
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "content_manager",
  "displayName": "Content Manager",
  "description": "Manages all content",
  "level": 3,
  "permissionIds": [5, 6, 7, 8]
}
```

#### 4. Update Role (Super Admin only)
```bash
PUT /api/v1/roles/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "Senior Content Manager",
  "description": "Updated description"
}
```

#### 5. Get Role Permissions
```bash
GET /api/v1/roles/:id/permissions
Authorization: Bearer <token>
```

#### 6. Assign Permissions to Role (Super Admin only)
```bash
POST /api/v1/roles/:id/permissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "permissionIds": [5, 6, 7, 8, 9]
}
```

#### 7. Remove Permissions from Role (Super Admin only)
```bash
DELETE /api/v1/roles/:id/permissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "permissionIds": [9]
}
```

#### 8. Delete Role (Super Admin only)
```bash
DELETE /api/v1/roles/:id
Authorization: Bearer <token>
```

---

### Permissions Management

#### 1. Get All Permissions
```bash
GET /api/v1/permissions
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "action": "manage",
      "subject": "all",
      "reason": "Full system control"
    },
    {
      "id": 2,
      "action": "create",
      "subject": "User",
      "reason": "Create new users"
    },
    {
      "id": 3,
      "action": "read",
      "subject": "User",
      "reason": "View user information"
    }
  ]
}
```

#### 2. Get Single Permission
```bash
GET /api/v1/permissions/:id
Authorization: Bearer <token>
```

#### 3. Filter Permissions by Action or Subject
```bash
GET /api/v1/permissions?action=create
GET /api/v1/permissions?subject=Story
GET /api/v1/permissions?action=create&subject=Story
Authorization: Bearer <token>
```

#### 4. Create Permission (Super Admin only)
```bash
POST /api/v1/permissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "export",
  "subject": "Story",
  "reason": "Export stories to various formats",
  "conditions": {
    "status": "published"
  },
  "fields": ["title", "content", "publishedAt"]
}
```

#### 5. Update Permission (Super Admin only)
```bash
PUT /api/v1/permissions/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Updated reason",
  "conditions": {
    "status": ["published", "archived"]
  }
}
```

#### 6. Delete Permission (Super Admin only)
```bash
DELETE /api/v1/permissions/:id
Authorization: Bearer <token>
```

---

### User Role Assignment

#### 1. Get User's Roles
```bash
GET /api/v1/users/:userId/roles
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "primaryRole": {
      "id": 2,
      "name": "admin",
      "displayName": "Admin",
      "level": 4
    },
    "additionalRoles": [
      {
        "id": 3,
        "name": "editor",
        "displayName": "Editor",
        "level": 3,
        "isActive": true,
        "assignedAt": "2025-11-20T10:00:00Z"
      }
    ]
  }
}
```

#### 2. Assign Role to User (Admin+)
```bash
POST /api/v1/users/:userId/roles
Authorization: Bearer <token>
Content-Type: application/json

{
  "roleId": 3
}
```

#### 3. Remove Role from User (Admin+)
```bash
DELETE /api/v1/users/:userId/roles/:roleId
Authorization: Bearer <token>
```

#### 4. Activate User Role
```bash
POST /api/v1/users/:userId/roles/:roleId/activate
Authorization: Bearer <token>
```

#### 5. Deactivate User Role
```bash
POST /api/v1/users/:userId/roles/:roleId/deactivate
Authorization: Bearer <token>
```

---

## Permission Structure

### Actions
Available actions for permissions:

| Action | Description |
|--------|-------------|
| `manage` | Full control (super admin only) |
| `create` | Create new resources |
| `read` | View/read resources |
| `update` | Modify existing resources |
| `delete` | Remove resources |
| `restore` | Restore soft-deleted resources |
| `export` | Export data |
| `import` | Import data |
| `publish` | Publish content |
| `archive` | Archive content |
| `moderate` | Moderate content |
| `assign` | Assign resources to users |

### Subjects
Available subjects (resources):

| Subject | Description |
|---------|-------------|
| `all` | All resources (super admin) |
| `User` | User management |
| `Story` | Story/article management |
| `StoryVersion` | Story version control |
| `Attachment` | File/media management |
| `Category` | Category management |
| `Tag` | Tag management |
| `Session` | User session management |
| `Role` | Role management (ACL) |
| `Permission` | Permission management (ACL) |
| `Country` | Country data |
| `Setting` | System settings |
| `AuditLog` | Audit log access |
| `PostType` | Dynamic post type management |
| `FieldDefinition` | Field definition management |
| `Content` | Dynamic content management |

---

## Frontend Integration Examples

### Vue.js/React Example

#### 1. Check User Permissions

```javascript
// Store user data after login
const user = {
  id: 'uuid',
  name: 'John Doe',
  primaryRole: {
    id: 3,
    name: 'editor',
    level: 3
  },
  permissions: []
}

// Fetch user's effective permissions
async function loadUserPermissions() {
  const response = await fetch(`/api/v1/users/${user.id}/roles`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })
  const data = await response.json()
  
  // Extract all permissions from primary and additional roles
  const allPermissions = []
  if (data.data.primaryRole?.permissions) {
    allPermissions.push(...data.data.primaryRole.permissions)
  }
  if (data.data.additionalRoles) {
    data.data.additionalRoles.forEach(role => {
      if (role.permissions) {
        allPermissions.push(...role.permissions)
      }
    })
  }
  
  user.permissions = allPermissions
}

// Check if user can perform action
function canUser(action, subject) {
  return user.permissions.some(p => 
    (p.action === action || p.action === 'manage') &&
    (p.subject === subject || p.subject === 'all')
  )
}

// Usage in components
if (canUser('create', 'Story')) {
  // Show "Create Story" button
}

if (canUser('delete', 'User')) {
  // Show "Delete User" button
}
```

#### 2. Role-Based UI Components

```vue
<!-- Vue.js Component -->
<template>
  <div>
    <!-- Show for Editor and above -->
    <button v-if="userLevel >= 3" @click="createStory">
      Create Story
    </button>

    <!-- Show for Admin and above -->
    <button v-if="userLevel >= 4" @click="manageUsers">
      Manage Users
    </button>

    <!-- Show for Super Admin only -->
    <button v-if="userLevel >= 5" @click="manageRoles">
      Manage Roles
    </button>
  </div>
</template>

<script>
export default {
  computed: {
    userLevel() {
      return this.$store.state.user?.primaryRole?.level || 0
    }
  }
}
</script>
```

#### 3. Role Management Interface

```javascript
// Fetch all roles for dropdown
async function fetchRoles() {
  const response = await fetch('/api/v1/roles', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })
  const data = await response.json()
  return data.data
}

// Assign role to user
async function assignRole(userId, roleId) {
  const response = await fetch(`/api/v1/users/${userId}/roles`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ roleId })
  })
  
  if (response.ok) {
    console.log('Role assigned successfully')
  }
}

// Update user's primary role (in user profile)
async function updateUserRole(userId, roleId) {
  const response = await fetch(`/api/v1/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      primaryRoleId: roleId 
    })
  })
  
  if (response.ok) {
    console.log('User role updated')
  }
}
```

---

## Common Use Cases

### 1. User Management Dashboard

```javascript
// Show users with their roles
async function loadUsersWithRoles() {
  const response = await fetch('/api/v1/users?include=roles', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })
  const data = await response.json()
  
  // Display users
  data.data.forEach(user => {
    console.log(`${user.name} - ${user.primaryRole.displayName}`)
  })
}

// Change user role
async function changeUserRole(userId, newRoleId) {
  // Get current roles
  const currentRoles = await fetch(`/api/v1/users/${userId}/roles`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })
  const rolesData = await currentRoles.json()
  
  // Update primary role via user update endpoint
  await fetch(`/api/v1/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      primaryRoleId: newRoleId
    })
  })
}
```

### 2. Role Management Interface

```javascript
// Create custom role
async function createCustomRole(roleData) {
  // First, get available permissions
  const permResponse = await fetch('/api/v1/permissions', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })
  const permissions = await permResponse.json()
  
  // Let user select permissions from UI
  // Then create role with selected permission IDs
  const response = await fetch('/api/v1/roles', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: roleData.name,
      displayName: roleData.displayName,
      description: roleData.description,
      level: roleData.level,
      permissionIds: roleData.selectedPermissionIds
    })
  })
  
  return response.json()
}

// Update role permissions
async function updateRolePermissions(roleId, newPermissionIds) {
  const response = await fetch(`/api/v1/roles/${roleId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      permissionIds: newPermissionIds
    })
  })
  
  return response.json()
}
```

### 3. Permission Check Helper

```javascript
// Create a reusable permission checker
class PermissionChecker {
  constructor(user) {
    this.user = user
    this.permissions = []
  }

  async loadPermissions() {
    const response = await fetch(
      `/api/v1/users/${this.user.id}/roles`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )
    const data = await response.json()
    
    // Extract all permissions from primary and additional roles
    this.permissions = []
    if (data.data.primaryRole?.permissions) {
      this.permissions.push(...data.data.primaryRole.permissions)
    }
    if (data.data.additionalRoles) {
      data.data.additionalRoles.forEach(role => {
        if (role.permissions && role.isActive) {
          this.permissions.push(...role.permissions)
        }
      })
    }
  }

  can(action, subject) {
    // Check if user has super admin (manage all)
    if (this.permissions.some(p => 
      p.action === 'manage' && p.subject === 'all'
    )) {
      return true
    }

    // Check specific permission
    return this.permissions.some(p =>
      p.action === action && p.subject === subject
    )
  }

  canAny(actions, subject) {
    return actions.some(action => this.can(action, subject))
  }

  canAll(actions, subject) {
    return actions.every(action => this.can(action, subject))
  }

  hasRole(roleName) {
    return this.user.primaryRole.name === roleName ||
           this.user.additionalRoles?.some(r => r.name === roleName)
  }

  hasMinLevel(level) {
    return this.user.primaryRole.level >= level
  }
}

// Usage
const checker = new PermissionChecker(currentUser)
await checker.loadPermissions()

if (checker.can('create', 'Story')) {
  // Show create button
}

if (checker.hasMinLevel(4)) {
  // Show admin features
}
```

---

## Error Handling

### Common Error Responses

#### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```
**Solution**: Token expired or invalid. Refresh token or login again.

#### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Insufficient permissions to perform this action"
}
```
**Solution**: User doesn't have required permissions. Hide UI elements or upgrade role.

#### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Role not found"
}
```
**Solution**: Invalid role/permission ID.

---

## Best Practices

### 1. Cache Permissions Locally
```javascript
// Store in localStorage/sessionStorage
localStorage.setItem('userPermissions', JSON.stringify(permissions))

// Load on app init
const cachedPermissions = JSON.parse(localStorage.getItem('userPermissions'))
```

### 2. Refresh Permissions on Role Change
```javascript
// After role assignment/update
await refreshUserPermissions()
```

### 3. Handle Permission Changes
```javascript
// Listen for role updates via WebSocket or polling
socket.on('roleUpdated', async () => {
  await refreshUserPermissions()
  window.location.reload() // Or update UI dynamically
})
```

### 4. Graceful Degradation
```javascript
// Hide features user can't access
if (!canUser('delete', 'User')) {
  deleteButton.style.display = 'none'
}

// Show message for restricted features
if (!canUser('export', 'Story')) {
  showMessage('Upgrade to Editor role to export stories')
}
```

---

## Testing

### Default Test Users

After running `npm run db:seed:users` and `npm run db:seed:acl`:

| Email | Password | Role | Purpose |
|-------|----------|------|---------|
| admin@kuybi.dev | Admin@123 | Super Admin | Full access testing |

### Creating Test Users with Different Roles

```bash
# Use the admin panel or API to create users
POST /api/v1/users
Authorization: Bearer <admin-token>

{
  "name": "Test Editor",
  "email": "editor@test.com",
  "password": "Test@123",
  "primaryRoleId": 3
}
```

---

## Quick Reference

### Permission Matrix

| Role | Create Story | Publish | Delete User | Manage Roles |
|------|--------------|---------|-------------|--------------|
| User | ❌ | ❌ | ❌ | ❌ |
| Moderator | ❌ | ❌ | ❌ | ❌ |
| Editor | ✅ | ✅ | ❌ | ❌ |
| Admin | ✅ | ✅ | ✅ | ❌ |
| Super Admin | ✅ | ✅ | ✅ | ✅ |

---

## Support

For issues or questions:
- Check API documentation: `http://localhost:4040/api/docs`
- Review backend logs for detailed errors
- Contact backend team for permission issues

---

## Changelog

**Version 1.0** (November 2025)
- Initial ACL system implementation
- Role hierarchy with 5 default roles
- 50+ predefined permissions
- Dynamic role and permission management
- User role assignment APIs
