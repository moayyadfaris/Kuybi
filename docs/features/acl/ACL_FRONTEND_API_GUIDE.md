# ACL Management API Guide

This document helps the frontend team integrate with the existing RBAC/ACL endpoints and build management screens for roles, permissions, and user assignments.

---

## 1. Authentication & Headers

All endpoints listed below:

| Header            | Value                                 |
|-------------------|---------------------------------------|
| `Authorization`   | `Bearer <JWT>` issued by `/api/v1/auth/login` |
| `Content-Type`    | `application/json`                    |
| `Accept`          | `application/json`                    |

Permissions are enforced via `JwtAuthGuard`, `AbilityGuard`, and in many cases `SuperAdminGuard` or `RoleHierarchyGuard`. UI should disable actions if the user lacks the required ability.

---

## 2. Roles API (`/api/v1/roles`)

| Method & Route          | Description                           | Required Ability / Guard              |
|------------------------|---------------------------------------|---------------------------------------|
| `POST /roles`          | Create role                           | `create:Role`, `SuperAdminGuard`      |
| `GET /roles`           | List roles                            | `read:Role`, `SuperAdminGuard`        |
| `GET /roles/active`    | List only active roles                | `read:Role`, `SuperAdminGuard`        |
| `GET /roles/:id`       | Role detail                           | `read:Role`, `SuperAdminGuard`        |
| `GET /roles/:id/permissions` | Permissions on a role          | `read:Role`, `SuperAdminGuard`        |
| `PUT /roles/:id`       | Update name/metadata                  | `update:Role`, `SuperAdminGuard`      |
| `DELETE /roles/:id`    | Delete role (blocked for system roles)| `delete:Role`, `SuperAdminGuard`      |
| `POST /roles/:id/permissions` | Assign permissions           | `update:Role`, `SuperAdminGuard`      |
| `DELETE /roles/:id/permissions` | Remove permissions         | `update:Role`, `SuperAdminGuard`      |

### Sample: Create Role
```http
POST /api/v1/roles
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "content-editor",
  "description": "Can edit and publish stories",
  "priority": 60,
  "isSystem": false,
  "isActive": true
}
```

### Sample: Attach Permissions
```http
POST /api/v1/roles/5/permissions
Authorization: Bearer <token>

{
  "permissionIds": [12, 18, 27]
}
```

---

## 3. Permissions API (`/api/v1/permissions`)

| Method & Route          | Description                          | Guard / Ability                   |
|------------------------|--------------------------------------|-----------------------------------|
| `POST /permissions`    | Create permission                    | `create:Permission`, `SuperAdmin` |
| `GET /permissions`     | List or filter by `action`/`subject` | `read:Permission`, `SuperAdmin`   |
| `GET /permissions/:id` | Permission detail                    | `read:Permission`, `SuperAdmin`   |
| `PUT /permissions/:id` | Update action/subject/conditions     | `update:Permission`, `SuperAdmin` |
| `DELETE /permissions/:id` | Remove permission                 | `delete:Permission`, `SuperAdmin` |

### Filters
`GET /permissions?action=Manage&subject=Story` returns matching permission entries, useful for dropdown filters or builders.

### Sample Schema
```json
{
  "id": 18,
  "action": "Update",
  "subject": "Story",
  "conditions": { "userId": "${userId}" },
  "fields": [],
  "inverted": false,
  "reason": "Update own stories"
}
```

---

## 4. User Role Assignments (`/api/v1/users/:userId/roles`)

Routes use `JwtAuthGuard + AbilityGuard` and mutate operations add `RoleHierarchyGuard`.

| Method & Route                                 | Description                                    |
|------------------------------------------------|------------------------------------------------|
| `GET /users/:userId/roles`                     | List roles assigned to user                    |
| `POST /users/:userId/roles`                    | Assign role via `AssignRoleDto`                |
| `DELETE /users/:userId/roles/:roleAssignmentId`| Revoke role                                    |
| `POST /users/:userId/roles/:roleId/activate`   | Activate assignment                            |
| `POST /users/:userId/roles/:roleId/deactivate` | Deactivate assignment                          |

### Assign Role Payload
```json
{
  "roleId": 5,
  "expiresAt": "2025-01-01T00:00:00Z",
  "isActive": true
}
```

Frontends should show hierarchy warnings (e.g., cannot assign super-admin) using the 403 response message from backend.

---

## 5. Supporting Data Sources

- **Subjects & Actions**
  - Enumerations are in `src/modules/acl/types/subjects.enum.ts` and `actions.enum.ts`. Expose them to UI to build multi-selects.

- **Role Priorities**
  - `priority` determines hierarchy (`super-admin` highest). UI should display this to prevent accidental privilege inversion.

- **Audit / Session Data**
  - `GET /api/v1/audit/...` (if enabled) can show change history.
  - `GET /api/v1/sessions/users/:userId` helps confirm session cleanup after role removal.

---

## 6. UX Recommendations

1. **Guarded Actions:** hide or disable buttons if the authenticated user lacks permission; backend still enforces.
2. **Optimistic UI with Fallback:** update UI immediately but refresh from server to reflect actual state (especially for assignments blocked by hierarchy).
3. **Search & Filters:** use query filters for permissions and roles (action, subject, status) to make screens responsive.
4. **Audit Trail Exposure:** show change metadata (who changed role, when) using log endpoints where available.
5. **Error Handling:** map 403 errors to user-friendly messages (“Insufficient privileges or role priority too low”).

---

## 7. Sandbox & Testing

- Use existing integration tests (e.g., `test/integration/users/user-profile.integration.spec.ts`, `user-roles.controller.ts`) as reference for expected payloads.
- Seed data via `src/modules/acl/seeders/seed-acl.ts` to get baseline roles/permissions in dev environments.

---

By aligning UI forms with the routes described above, the frontend team can deliver comprehensive ACL management (roles, permissions, assignments) without digging through backend code. Reach out to the backend team if additional read-only endpoints (e.g., audit summaries) are required.***
