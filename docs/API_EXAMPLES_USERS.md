# Users API - Frontend Integration Guide

## Base URL
```
http://localhost:4040/api/v1/users
```

## Authentication
All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Required Permissions
All endpoints require the user to have `read:User` permission.

---

## Endpoints

### 1. List All Users (with Filters & Pagination)

**Endpoint:** `GET /v1/users`

#### Basic Request - Get All Users (Default: 20 per page)
```bash
curl -X GET "http://localhost:4040/api/v1/users" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Response Structure
```json
{
  "data": [
    {
      "id": "db9fef37-5a9b-4d74-82f4-f2c753ed179e",
      "name": "Admin User",
      "email": "admin@susano.dev",
      "mobileNumber": "+1234567890",
      "role": "super-admin",
      "isActive": true,
      "isVerified": true,
      "isEmailVerified": true,
      "createdAt": "2024-11-01T10:30:00.000Z",
      "updatedAt": "2024-11-09T15:45:00.000Z"
    },
    {
      "id": "40246839-c1c8-470f-9b18-81fd04006679",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "mobileNumber": "+1234567891",
      "role": "ROLE_USER",
      "isActive": true,
      "isVerified": false,
      "isEmailVerified": false,
      "createdAt": "2024-11-05T08:20:00.000Z",
      "updatedAt": "2024-11-05T08:20:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### Filter Examples

#### 1. Search by Name or Email
```bash
# Search for users with "john" in name or email
curl -X GET "http://localhost:4040/api/v1/users?search=john" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Search for admin users
curl -X GET "http://localhost:4040/api/v1/users?search=admin" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Search by email domain
curl -X GET "http://localhost:4040/api/v1/users?search=@example.com" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 2. Filter by Role
```bash
# Get all super-admin users
curl -X GET "http://localhost:4040/api/v1/users?role=super-admin" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get all regular users
curl -X GET "http://localhost:4040/api/v1/users?role=ROLE_USER" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get all admin users
curl -X GET "http://localhost:4040/api/v1/users?role=admin" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Filter by Active Status
```bash
# Get only active users
curl -X GET "http://localhost:4040/api/v1/users?isActive=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get inactive/suspended users
curl -X GET "http://localhost:4040/api/v1/users?isActive=false" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 4. Filter by Verified Status
```bash
# Get only verified users
curl -X GET "http://localhost:4040/api/v1/users?isVerified=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get unverified users
curl -X GET "http://localhost:4040/api/v1/users?isVerified=false" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 5. Combine Multiple Filters
```bash
# Active + Verified users only
curl -X GET "http://localhost:4040/api/v1/users?isActive=true&isVerified=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Search for active admin users
curl -X GET "http://localhost:4040/api/v1/users?role=admin&isActive=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Search "john" among verified users
curl -X GET "http://localhost:4040/api/v1/users?search=john&isVerified=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Active users with "test" in name/email
curl -X GET "http://localhost:4040/api/v1/users?search=test&isActive=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### Pagination Examples

#### 1. Basic Pagination
```bash
# First page (20 users)
curl -X GET "http://localhost:4040/api/v1/users?limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Second page (next 20 users)
curl -X GET "http://localhost:4040/api/v1/users?limit=20&offset=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Third page
curl -X GET "http://localhost:4040/api/v1/users?limit=20&offset=40" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 2. Custom Page Size
```bash
# Get 10 users per page
curl -X GET "http://localhost:4040/api/v1/users?limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get 50 users per page
curl -X GET "http://localhost:4040/api/v1/users?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get 100 users per page
curl -X GET "http://localhost:4040/api/v1/users?limit=100&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### 3. Pagination with Filters
```bash
# Page 2 of active users (50 per page)
curl -X GET "http://localhost:4040/api/v1/users?isActive=true&limit=50&offset=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Page 3 of search results for "john"
curl -X GET "http://localhost:4040/api/v1/users?search=john&limit=20&offset=40" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 2. Get User Statistics

**Endpoint:** `GET /v1/users/stats`

```bash
curl -X GET "http://localhost:4040/api/v1/users/stats" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Response Example
```json
{
  "total": 150,
  "active": 142,
  "inactive": 8,
  "verified": 130,
  "unverified": 20,
  "byRole": {
    "super-admin": 2,
    "admin": 10,
    "ROLE_USER": 138
  }
}
```

---

### 3. Get User by ID

**Endpoint:** `GET /v1/users/:id`

```bash
# Get specific user details
curl -X GET "http://localhost:4040/api/v1/users/db9fef37-5a9b-4d74-82f4-f2c753ed179e" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Response Example
```json
{
  "id": "db9fef37-5a9b-4d74-82f4-f2c753ed179e",
  "name": "Admin User",
  "email": "admin@susano.dev",
  "mobileNumber": "+1234567890",
  "isActive": true,
  "isVerified": true,
  "isEmailVerified": true,
  "profileImageUrl": "https://s3.amazonaws.com/bucket/path/to/image.jpg",
  "createdAt": "2024-11-01T10:30:00.000Z",
  "updatedAt": "2024-11-09T15:45:00.000Z"
}
```

---

## JavaScript/TypeScript Examples

### Using Axios

```typescript
import axios from 'axios';

const API_BASE_URL = 'http://localhost:4040/api';
const token = localStorage.getItem('accessToken');

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// 1. Get all users (first page)
async function getAllUsers() {
  const response = await api.get('/v1/users');
  return response.data;
}

// 2. Search users by name/email
async function searchUsers(searchTerm: string) {
  const response = await api.get('/v1/users', {
    params: { search: searchTerm }
  });
  return response.data;
}

// 3. Get users by role
async function getUsersByRole(role: string) {
  const response = await api.get('/v1/users', {
    params: { role }
  });
  return response.data;
}

// 4. Get active verified users
async function getActiveVerifiedUsers() {
  const response = await api.get('/v1/users', {
    params: {
      isActive: true,
      isVerified: true
    }
  });
  return response.data;
}

// 5. Get users with pagination
async function getUsersPage(page: number, pageSize: number = 20) {
  const offset = page * pageSize;
  const response = await api.get('/v1/users', {
    params: {
      limit: pageSize,
      offset: offset
    }
  });
  return response.data;
}

// 6. Advanced search with multiple filters
async function advancedUserSearch(filters: {
  search?: string;
  role?: string;
  isActive?: boolean;
  isVerified?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const { page = 0, pageSize = 20, ...otherFilters } = filters;
  const response = await api.get('/v1/users', {
    params: {
      ...otherFilters,
      limit: pageSize,
      offset: page * pageSize
    }
  });
  return response.data;
}

// 7. Get user statistics
async function getUserStats() {
  const response = await api.get('/v1/users/stats');
  return response.data;
}

// 8. Get user by ID
async function getUserById(userId: string) {
  const response = await api.get(`/v1/users/${userId}`);
  return response.data;
}

// Usage examples:
const users = await getAllUsers();
const searchResults = await searchUsers('john');
const admins = await getUsersByRole('admin');
const activeUsers = await getActiveVerifiedUsers();
const page2 = await getUsersPage(1, 50); // Page 2 with 50 items
const stats = await getUserStats();
const user = await getUserById('db9fef37-5a9b-4d74-82f4-f2c753ed179e');

// Advanced search example
const filteredUsers = await advancedUserSearch({
  search: 'john',
  isActive: true,
  isVerified: true,
  role: 'ROLE_USER',
  page: 0,
  pageSize: 20
});
```

### Using Fetch API

```typescript
const API_BASE_URL = 'http://localhost:4040/api';
const token = localStorage.getItem('accessToken');

// Helper function for API calls
async function apiCall(endpoint: string, params?: Record<string, any>) {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  
  if (params) {
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, String(params[key]));
      }
    });
  }
  
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// Usage examples
const users = await apiCall('/v1/users');
const searchResults = await apiCall('/v1/users', { search: 'john' });
const activeUsers = await apiCall('/v1/users', { isActive: true });
const page2 = await apiCall('/v1/users', { limit: 20, offset: 20 });
```

---

## React Hooks Example

```typescript
import { useState, useEffect } from 'react';
import axios from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
  mobileNumber: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UsersResponse {
  data: User[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface UserFilters {
  search?: string;
  role?: string;
  isActive?: boolean;
  isVerified?: boolean;
  page?: number;
  pageSize?: number;
}

// Custom hook for users list
export function useUsers(filters: UserFilters = {}) {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { page = 0, pageSize = 20, ...otherFilters } = filters;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('accessToken');
        
        const response = await axios.get<UsersResponse>(
          'http://localhost:4040/api/v1/users',
          {
            params: {
              ...otherFilters,
              limit: pageSize,
              offset: page * pageSize
            },
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        setUsers(response.data.data);
        setPagination(response.data.pagination);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [page, pageSize, JSON.stringify(otherFilters)]);

  return { users, pagination, loading, error };
}

// Example component using the hook
export function UsersList() {
  const [filters, setFilters] = useState<UserFilters>({
    page: 0,
    pageSize: 20
  });

  const { users, pagination, loading, error } = useUsers(filters);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {/* Search input */}
      <input
        type="text"
        placeholder="Search users..."
        onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 0 })}
      />

      {/* Role filter */}
      <select
        onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 0 })}
      >
        <option value="">All Roles</option>
        <option value="super-admin">Super Admin</option>
        <option value="admin">Admin</option>
        <option value="ROLE_USER">User</option>
      </select>

      {/* Active filter */}
      <label>
        <input
          type="checkbox"
          checked={filters.isActive ?? false}
          onChange={(e) => setFilters({ ...filters, isActive: e.target.checked, page: 0 })}
        />
        Active Only
      </label>

      {/* Users list */}
      <div>
        {users.map(user => (
          <div key={user.id}>
            <h3>{user.name}</h3>
            <p>{user.email}</p>
            <span>{user.role}</span>
            <span>{user.isActive ? 'Active' : 'Inactive'}</span>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div>
        <button
          disabled={filters.page === 0}
          onClick={() => setFilters({ ...filters, page: filters.page! - 1 })}
        >
          Previous
        </button>
        <span>
          Page {filters.page! + 1} of {Math.ceil(pagination.total / pagination.limit)}
        </span>
        <button
          disabled={!pagination.hasMore}
          onClick={() => setFilters({ ...filters, page: filters.page! + 1 })}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

---

## Error Handling

### Common Error Responses

#### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```
**Solution:** Provide a valid JWT token or refresh the token.

#### 403 Forbidden
```json
{
  "statusCode": 403,
  "message": "Insufficient permissions to read users",
  "error": "Forbidden"
}
```
**Solution:** User needs `read:User` permission. Contact admin to assign proper role.

#### 404 Not Found (for /users/:id)
```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found"
}
```
**Solution:** Verify the user ID exists.

---

## Query Parameters Summary

| Parameter    | Type    | Required | Default | Description                           |
|-------------|---------|----------|---------|---------------------------------------|
| `search`    | string  | No       | -       | Search by name or email               |
| `role`      | string  | No       | -       | Filter by role                        |
| `isActive`  | boolean | No       | -       | Filter by active status               |
| `isVerified`| boolean | No       | -       | Filter by verified status             |
| `limit`     | number  | No       | 20      | Number of results per page (max: 100) |
| `offset`    | number  | No       | 0       | Offset for pagination                 |

---

## Best Practices

1. **Always handle errors** - API calls can fail due to network issues, authentication, or permissions
2. **Implement pagination** - Don't load all users at once, use pagination
3. **Debounce search input** - Wait for user to stop typing before making API call
4. **Cache results** - Consider caching user lists for better performance
5. **Show loading states** - Provide feedback while data is loading
6. **Validate permissions** - Check if user has `read:User` permission before calling
7. **Handle token expiry** - Implement token refresh logic

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- User IDs are UUIDs (v4)
- Maximum `limit` is typically 100 users per request
- Search is case-insensitive
- Boolean parameters accept: `true`, `false`, `1`, `0`
- Empty/null filters are ignored

---

For more information, visit the API documentation at:
`http://localhost:4040/api/docs`
