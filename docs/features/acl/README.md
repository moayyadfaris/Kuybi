# ACL (Access Control List) Implementation

## Overview

The ACL module provides enterprise-grade role-based access control (RBAC) for the Kuybi platform using the CASL library. It supports fine-grained permissions with dynamic conditions, field-level access control, and time-based role assignments.

## Architecture

### Core Components

1. **Entities**
   - `Role`: User roles with priority and system protection
   - `Permission`: Fine-grained permissions with action-subject pairs
   - `RolePermission`: Many-to-many relationship between roles and permissions
   - `UserRole`: User role assignments with expiration support

2. **Enums**
   - `Action`: 12 actions (Manage, Create, Read, Update, Delete, Restore, Export, Import, Publish, Archive, Moderate, Assign)
   - `Subject`: 11 subjects (All, User, Story, Attachment, Category, Tag, Session, Role, Permission, Country, Setting)

3. **CASL Integration**
   - `AbilityFactory`: Creates user-specific permission abilities
   - `AbilityGuard`: NestJS guard for route protection
   - `@CheckAbility`: Decorator for permission metadata

4. **Services**
   - `RolesService`: CRUD operations for roles
   - `PermissionsService`: CRUD operations for permissions

5. **Controllers**
   - `RolesController`: REST API for role management
   - `PermissionsController`: REST API for permission management

## Database Schema

### Tables

#### `roles`
```sql
- id: SERIAL PRIMARY KEY
- name: VARCHAR(50) UNIQUE NOT NULL
- description: TEXT
- isSystem: BOOLEAN DEFAULT FALSE
- isActive: BOOLEAN DEFAULT TRUE
- priority: INTEGER DEFAULT 50 (1-100)
- createdAt: TIMESTAMPTZ
- updatedAt: TIMESTAMPTZ
- deletedAt: TIMESTAMPTZ (soft delete)

Indexes:
- idx_roles_name
- idx_roles_is_active
- idx_roles_deleted_at
```

#### `permissions`
```sql
- id: SERIAL PRIMARY KEY
- action: permission_action_enum NOT NULL
- subject: permission_subject_enum NOT NULL
- conditions: JSONB DEFAULT '{}'
- fields: TEXT[] DEFAULT ARRAY[]::TEXT[]
- inverted: BOOLEAN DEFAULT FALSE
- reason: TEXT
- createdAt: TIMESTAMPTZ
- updatedAt: TIMESTAMPTZ

Indexes:
- idx_permissions_action
- idx_permissions_subject
- idx_permissions_action_subject (UNIQUE)
```

#### `role_permissions`
```sql
- id: SERIAL PRIMARY KEY
- roleId: INTEGER REFERENCES roles(id) ON DELETE CASCADE
- permissionId: INTEGER REFERENCES permissions(id) ON DELETE CASCADE
- createdAt: TIMESTAMPTZ

Constraints:
- UNIQUE (roleId, permissionId)

Indexes:
- idx_role_permissions_role_id
- idx_role_permissions_permission_id
```

#### `user_roles`
```sql
- id: SERIAL PRIMARY KEY
- userId: UUID REFERENCES users(id) ON DELETE CASCADE
- roleId: INTEGER REFERENCES roles(id) ON DELETE CASCADE
- assignedBy: UUID REFERENCES users(id) ON DELETE SET NULL
- expiresAt: TIMESTAMPTZ
- isActive: BOOLEAN DEFAULT TRUE
- createdAt: TIMESTAMPTZ
- updatedAt: TIMESTAMPTZ

Indexes:
- idx_user_roles_user_id
- idx_user_roles_role_id
- idx_user_roles_assigned_by
- idx_user_roles_expires_at
- idx_user_roles_is_active
```

### ENUM Types

```sql
CREATE TYPE permission_action_enum AS ENUM (
  'manage', 'create', 'read', 'update', 'delete', 'restore',
  'export', 'import', 'publish', 'archive', 'moderate', 'assign'
);

CREATE TYPE permission_subject_enum AS ENUM (
  'all', 'User', 'Story', 'Attachment', 'Category', 'Tag',
  'Session', 'Role', 'Permission', 'Country', 'Setting'
);
```

## Default Roles & Permissions

### Role Hierarchy (by priority)

1. **super-admin** (Priority: 100)
   - Full system access
   - Permission: `manage:all`
   - Cannot be deleted or modified

2. **admin** (Priority: 90)
   - Manage most resources
   - Cannot manage roles/permissions
   - Permissions: All CRUD on User, Story, Attachment, Category, Tag, Session, Country, Setting

3. **moderator** (Priority: 70)
   - Moderate content
   - Read user data
   - Permissions: read/update/delete/moderate/publish/archive on Story and Attachment

4. **user** (Priority: 50)
   - Own resources only
   - Ownership validated via `${userId}` condition
   - Permissions: CRUD own stories/attachments, read public resources

5. **guest** (Priority: 10)
   - Read-only public access
   - Permissions: read on Story, Attachment, Category, Tag, Country

## Usage Examples

### 1. Protecting Controller Endpoints

```typescript
import { UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AbilityGuard, CheckAbility } from '../acl'
import { Action, Subject } from '../acl/types'

@Controller('api/v1/stories')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class StoriesController {
  // Create story - requires create permission
  @Post()
  @CheckAbility({ action: Action.Create, subject: Subject.Story })
  async create(@Body() dto: CreateStoryDto) {
    // Only users with 'create:Story' permission can access
  }

  // Update story - ownership checked via CASL conditions
  @Put(':id')
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  async update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
    // User can update if:
    // 1. Has 'update:Story' permission (admin/moderator), OR
    // 2. Has 'update:Story' with condition {userId: '${userId}'} (own stories)
  }

  // Multiple permission checks (OR logic)
  @Delete(':id')
  @CheckAbility(
    { action: Action.Delete, subject: Subject.Story },
    { action: Action.Manage, subject: Subject.All }
  )
  async remove(@Param('id') id: string) {
    // User needs EITHER delete:Story OR manage:all
  }
}
```

### 2. Programmatic Permission Checks

```typescript
import { AbilityFactory } from '../acl'
import { Action, Subject } from '../acl/types'

export class StoryService {
  constructor(private abilityFactory: AbilityFactory) {}

  async updateStory(user: User, storyId: string, dto: UpdateStoryDto) {
    const story = await this.findStory(storyId)
    
    // Create user-specific ability
    const ability = await this.abilityFactory.createForUser(user)
    
    // Check permission with subject instance
    if (ability.cannot(Action.Update, story)) {
      throw new ForbiddenException('You cannot update this story')
    }

    // Permission granted - proceed with update
    return this.update(story, dto)
  }

  async canUserModerate(user: User): Promise<boolean> {
    const ability = await this.abilityFactory.createForUser(user)
    return ability.can(Action.Moderate, Subject.Story)
  }
}
```

### 3. Assigning Roles to Users

```typescript
// Create user-role assignment
const userRole = new UserRole()
userRole.userId = user.id
userRole.roleId = role.id
userRole.assignedBy = currentUser.id
userRole.expiresAt = new Date('2025-12-31') // Optional expiration
userRole.isActive = true
await userRoleRepository.save(userRole)

// Check user roles
const isAdmin = user.hasRole('admin')
const isSuperAdmin = user.isSuperAdmin()
const roles = user.getRoles() // ['user', 'moderator']
```

### 4. Creating Custom Permissions

```typescript
// Permission with ownership condition
const permission = await permissionsService.create({
  action: Action.Update,
  subject: Subject.Story,
  conditions: { userId: '${userId}' }, // Placeholder replaced at runtime
  reason: 'Users can update their own stories'
})

// Permission with field restrictions
const permission = await permissionsService.create({
  action: Action.Read,
  subject: Subject.User,
  fields: ['id', 'name', 'email'], // Only these fields accessible
  reason: 'Limited user data access'
})

// Inverted permission (deny)
const permission = await permissionsService.create({
  action: Action.Delete,
  subject: Subject.Story,
  inverted: true, // DENY instead of ALLOW
  reason: 'Explicitly deny deletion'
})
```

## API Endpoints

### Roles

- `POST /api/v1/roles` - Create role
- `GET /api/v1/roles` - List all roles
- `GET /api/v1/roles/active` - List active roles
- `GET /api/v1/roles/:id` - Get role by ID
- `GET /api/v1/roles/:id/permissions` - Get role permissions
- `PUT /api/v1/roles/:id` - Update role
- `POST /api/v1/roles/:id/permissions` - Assign permissions to role
- `DELETE /api/v1/roles/:id/permissions` - Remove permissions from role
- `DELETE /api/v1/roles/:id` - Delete role (soft delete)

### Permissions

- `POST /api/v1/permissions` - Create permission
- `GET /api/v1/permissions` - List all permissions
- `GET /api/v1/permissions?action=create` - Filter by action
- `GET /api/v1/permissions?subject=Story` - Filter by subject
- `GET /api/v1/permissions?action=update&subject=Story` - Filter by both
- `GET /api/v1/permissions/:id` - Get permission by ID
- `PUT /api/v1/permissions/:id` - Update permission
- `DELETE /api/v1/permissions/:id` - Delete permission

## Setup & Deployment

### 1. Run Migrations

```bash
cd nest-app
npm run migration:run
```

This creates:
- `roles` table
- `permissions` table with ENUM types
- `role_permissions` junction table
- `user_roles` junction table

### 2. Seed Default Roles & Permissions

```bash
npm run db:seed:acl
```

This creates:
- 5 default roles (super-admin, admin, moderator, user, guest)
- 50+ default permissions
- Role-permission assignments

### 3. Register ACL Module

In `app.module.ts`:

```typescript
import { AclModule } from './acl/acl.module'

@Module({
  imports: [
    // ... other modules
    AclModule,
  ],
})
export class AppModule {}
```

### 4. Update User Entity

The User entity now includes:
- `userRoles: UserRole[]` relationship
- `hasRole(roleName: string): boolean` helper
- `getRoles(): string[]` helper
- `isSuperAdmin(): boolean` helper
- `isAdmin(): boolean` helper

## Permission Matrix

| Action | super-admin | admin | moderator | user | guest |
|--------|-------------|-------|-----------|------|-------|
| **manage:all** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **create:User** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **read:User** | ✅ | ✅ | ✅ | Own only | ❌ |
| **update:User** | ✅ | ✅ | ❌ | Own only | ❌ |
| **delete:User** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **create:Story** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **read:Story** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **update:Story** | ✅ | ✅ | ✅ | Own only | ❌ |
| **delete:Story** | ✅ | ✅ | ✅ | Own only | ❌ |
| **publish:Story** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **moderate:Story** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **create:Attachment** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **read:Attachment** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **update:Attachment** | ✅ | ✅ | ✅ | Own only | ❌ |
| **delete:Attachment** | ✅ | ✅ | ✅ | Own only | ❌ |
| **create:Category** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **read:Category** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **update:Category** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **delete:Category** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **create:Tag** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **read:Tag** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **update:Tag** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **delete:Tag** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **read:Session** | ✅ | ✅ | ❌ | Own only | ❌ |
| **delete:Session** | ✅ | ✅ | ❌ | Own only | ❌ |
| **create:Role** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **read:Role** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **update:Role** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **delete:Role** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **assign:Role** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **create:Permission** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **read:Permission** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **update:Permission** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **delete:Permission** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **read:Country** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **update:Country** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **read:Setting** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **update:Setting** | ✅ | ✅ | ❌ | ❌ | ❌ |

## CASL Condition Interpolation

The AbilityFactory automatically replaces `${userId}` placeholders in permission conditions with the actual user ID:

```typescript
// Permission definition
{
  action: 'update',
  subject: 'Story',
  conditions: { userId: '${userId}' }
}

// Runtime interpolation for user ID '123e4567-e89b-12d3-a456-426614174000'
ability.can('update', {
  __type: 'Story',
  userId: '123e4567-e89b-12d3-a456-426614174000'
}) // true - user owns the story

ability.can('update', {
  __type: 'Story',
  userId: 'different-user-id'
}) // false - user doesn't own the story
```

## Caching Strategy

All repositories use Redis caching with 15-minute TTL:

- **Role queries**: Cached by name, ID, active status
- **Permission queries**: Cached by action, subject, ID
- **Cache invalidation**: Automatic on create/update/delete operations
- **Cache keys**: Namespaced by entity type

## Security Considerations

1. **System Roles Protection**
   - System roles cannot be deleted
   - Name and isSystem flag cannot be changed
   - Prevents accidental privilege escalation

2. **Permission Validation**
   - All permission IDs validated before assignment
   - Duplicate action-subject pairs prevented
   - Cannot remove all permissions from system roles

3. **Time-based Access**
   - Role assignments support expiration dates
   - Expired roles automatically excluded from ability checks
   - Can be disabled via isActive flag

4. **Audit Trail**
   - Role assignments track assignedBy user
   - All entities have createdAt/updatedAt timestamps
   - Soft delete on roles preserves history

## Testing

Run ACL-related tests:

```bash
npm test -- acl
```

Test permission checks:

```bash
npm test -- abilities
```

## Troubleshooting

### Permission denied despite correct role

1. Check role is active: `role.isActive === true`
2. Check role assignment is active: `userRole.isActive === true`
3. Check role assignment not expired: `userRole.expiresAt > now || userRole.expiresAt === null`
4. Check permission conditions match entity data
5. Clear cache: `await roleRepository.invalidateAllCaches()`

### Circular dependency errors

Ensure imports use correct paths:
- Use `../acl` for cross-module imports
- Use relative paths within ACL module
- Check UserRole entity imports don't create cycles

### Migration failures

1. Ensure PostgreSQL version supports ENUM types (9.1+)
2. Check uuid-ossp extension is installed
3. Verify no existing tables with same names
4. Run migrations in order (check migration timestamps)

## Future Enhancements

- [ ] Multi-tenancy support (organizationId in conditions)
- [ ] Dynamic permission loading from database
- [ ] Permission inheritance between roles
- [ ] Temporal permissions (time-of-day restrictions)
- [ ] IP-based access restrictions
- [ ] Rate limiting per permission
- [ ] Audit logging for all permission checks
- [ ] GraphQL integration
- [ ] Permission analytics dashboard

## References

- [CASL Documentation](https://casl.js.org/)
- [NestJS Guards](https://docs.nestjs.com/guards)
- [TypeORM Relations](https://typeorm.io/relations)
- [PostgreSQL ENUM Types](https://www.postgresql.org/docs/current/datatype-enum.html)
