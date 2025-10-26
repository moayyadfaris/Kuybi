# ACL Quick Reference Guide

## 🎯 Common Use Cases

### 1. Protect a Controller Endpoint

```typescript
import { UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { AbilityGuard, CheckAbility } from '../acl'
import { Action, Subject } from '../acl/types'

@Controller('v1/stories')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class StoriesController {
  
  @Post()
  @CheckAbility({ action: Action.Create, subject: Subject.Story })
  async create(@Body() dto: CreateStoryDto) {
    // Only users with 'create:Story' permission
  }
  
  @Put(':id')
  @CheckAbility({ action: Action.Update, subject: Subject.Story })
  async update(@Param('id') id: string) {
    // Ownership automatically checked via ${userId} conditions
  }
  
  // Multiple permissions (OR logic)
  @Delete(':id')
  @CheckAbility(
    { action: Action.Delete, subject: Subject.Story },
    { action: Action.Manage, subject: Subject.All }
  )
  async delete(@Param('id') id: string) {
    // Requires EITHER delete:Story OR manage:all
  }
}
```

### 2. Check Permissions in Service

```typescript
import { ForbiddenException, Injectable } from '@nestjs/common'
import { AbilityFactory } from '../acl'
import { Action } from '../acl/types'

@Injectable()
export class StoryService {
  constructor(private abilityFactory: AbilityFactory) {}

  async updateStory(user: User, storyId: string, dto: UpdateStoryDto) {
    const story = await this.findOne(storyId)
    const ability = await this.abilityFactory.createForUser(user)
    
    // Check with subject instance (enables ownership check)
    if (ability.cannot(Action.Update, story)) {
      throw new ForbiddenException('You cannot update this story')
    }
    
    return this.update(story, dto)
  }

  async canUserPublish(user: User): Promise<boolean> {
    const ability = await this.abilityFactory.createForUser(user)
    return ability.can(Action.Publish, 'Story')
  }
}
```

### 3. Assign Role to User

```typescript
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserRole } from '../acl/entities'

@Injectable()
export class UserRoleService {
  constructor(
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>
  ) {}

  async assignRole(
    userId: string,
    roleId: number,
    assignedBy: string,
    expiresAt?: Date
  ): Promise<UserRole> {
    const userRole = this.userRoleRepo.create({
      userId,
      roleId,
      assignedBy,
      expiresAt,
      isActive: true
    })
    return this.userRoleRepo.save(userRole)
  }

  async revokeRole(userId: string, roleId: number): Promise<void> {
    await this.userRoleRepo.delete({ userId, roleId })
  }
}
```

### 4. Create Custom Permission

```typescript
import { Injectable } from '@nestjs/common'
import { PermissionsService } from '../acl/services'
import { Action, Subject } from '../acl/types'

@Injectable()
export class SetupService {
  constructor(private permissionsService: PermissionsService) {}

  async createCustomPermission() {
    // Permission with ownership condition
    await this.permissionsService.create({
      action: Action.Update,
      subject: Subject.Story,
      conditions: { userId: '${userId}' },
      reason: 'Users can update their own stories'
    })

    // Permission with field restrictions
    await this.permissionsService.create({
      action: Action.Read,
      subject: Subject.User,
      fields: ['id', 'name', 'email'],
      reason: 'Limited user data access'
    })

    // Deny permission
    await this.permissionsService.create({
      action: Action.Delete,
      subject: Subject.Story,
      inverted: true,
      reason: 'Explicitly deny deletion'
    })
  }
}
```

### 5. User Helper Methods

```typescript
// In your service or controller
async checkUserPermissions(user: User) {
  // Check specific role
  const isAdmin = user.hasRole('admin')
  const isModerator = user.hasRole('moderator')
  
  // Check super admin
  const isSuperAdmin = user.isSuperAdmin()
  
  // Check admin (includes super-admin)
  const isAdminOrSuper = user.isAdmin()
  
  // Get all roles
  const roles = user.getRoles() // ['user', 'moderator']
  
  return {
    isAdmin,
    isModerator,
    isSuperAdmin,
    roles
  }
}
```

## 📋 Actions Reference

| Action | Description | Example |
|--------|-------------|---------|
| `Manage` | Full control (super permission) | Super admin access |
| `Create` | Create new resources | Create story/user |
| `Read` | View resources | View stories/users |
| `Update` | Modify existing resources | Edit story/profile |
| `Delete` | Remove resources | Delete story/user |
| `Restore` | Restore soft-deleted resources | Undelete story |
| `Export` | Export data | Download user data |
| `Import` | Import data | Bulk upload |
| `Publish` | Publish content | Publish story |
| `Archive` | Archive resources | Archive old stories |
| `Moderate` | Moderate content | Review flagged content |
| `Assign` | Assign resources/roles | Assign role to user |

## 🎯 Subjects Reference

| Subject | Description | Example Resources |
|---------|-------------|-------------------|
| `All` | All subjects (wildcard) | Super admin permission |
| `User` | User accounts | User profiles, authentication |
| `Story` | Story content | Articles, posts |
| `Attachment` | File uploads | Images, documents |
| `Category` | Content categories | Story categories |
| `Tag` | Content tags | Story tags |
| `Session` | User sessions | Login sessions |
| `Role` | User roles | ACL roles |
| `Permission` | Permissions | ACL permissions |
| `Country` | Country data | Country list |
| `Setting` | System settings | App configuration |

## 🔐 Default Role Permissions

### Super Admin ⚡️
```typescript
{ action: 'manage', subject: 'all' }
// Can do ANYTHING without permission checks
// Bypasses ALL database queries and CASL evaluations
// See SUPER_ADMIN_ACCESS.md for details
```

### Admin
```typescript
// All CRUD on:
User, Story, Attachment, Category, Tag, Session, Country, Setting
// CANNOT manage roles/permissions
```

### Moderator
```typescript
// Read: User
// CRUD + Moderate + Publish + Archive: Story, Attachment
// Read: Category, Tag, Country, Setting
```

### User
```typescript
// Own resources only (${userId} conditions):
- Update own profile
- CRUD own stories
- CRUD own attachments
- View/delete own sessions
// Read public: Category, Tag, Country
```

### Guest
```typescript
// Read-only public access:
Story, Attachment, Category, Tag, Country
```

## 🧪 Testing Permissions

```typescript
// In your test file
import { Test } from '@nestjs/testing'
import { AbilityFactory } from '../acl'
import { Action, Subject } from '../acl/types'

describe('Story Permissions', () => {
  let abilityFactory: AbilityFactory

  it('should allow user to update own story', async () => {
    const user = { id: '123', userRoles: [...] }
    const story = { userId: '123', ... }
    
    const ability = await abilityFactory.createForUser(user)
    
    expect(ability.can(Action.Update, story)).toBe(true)
  })

  it('should deny user from updating other user story', async () => {
    const user = { id: '123', userRoles: [...] }
    const story = { userId: '456', ... }
    
    const ability = await abilityFactory.createForUser(user)
    
    expect(ability.can(Action.Update, story)).toBe(false)
  })

  it('should allow admin to update any story', async () => {
    const admin = { id: '123', userRoles: [adminRole] }
    const anyStory = { userId: '456', ... }
    
    const ability = await abilityFactory.createForUser(admin)
    
    expect(ability.can(Action.Update, anyStory)).toBe(true)
  })
})
```

## 🐛 Common Errors & Solutions

### Error: "Cannot read property 'userRoles' of undefined"
**Cause**: User entity doesn't have userRoles loaded  
**Solution**: Add relations when querying user
```typescript
const user = await userRepository.findOne({
  where: { id },
  relations: ['userRoles', 'userRoles.role', 'userRoles.role.rolePermissions', 'userRoles.role.rolePermissions.permission']
})
```

### Error: "Permission denied" despite having role
**Cause**: Role assignment expired or inactive  
**Solution**: Check role status
```typescript
// Check in database
SELECT * FROM user_roles 
WHERE user_id = '...' 
  AND is_active = true 
  AND (expires_at IS NULL OR expires_at > NOW())
```

### Error: "Circular dependency between modules"
**Cause**: Incorrect imports between User and ACL modules  
**Solution**: Use forwardRef or restructure imports
```typescript
import { forwardRef } from '@nestjs/common'

@Module({
  imports: [forwardRef(() => UsersModule)],
})
export class AclModule {}
```

## 📦 API Endpoints

**Note**: All endpoints use `/api/v1` prefix (configured globally in `main.ts`)

### Roles
```
POST   /api/v1/roles              - Create role
GET    /api/v1/roles              - List all roles
GET    /api/v1/roles/active       - List active roles
GET    /api/v1/roles/:id          - Get role
GET    /api/v1/roles/:id/permissions - Get role permissions
PUT    /api/v1/roles/:id          - Update role
POST   /api/v1/roles/:id/permissions - Assign permissions
DELETE /api/v1/roles/:id/permissions - Remove permissions
DELETE /api/v1/roles/:id          - Delete role
```

### Permissions
```
POST   /api/v1/permissions        - Create permission
GET    /api/v1/permissions        - List all permissions
GET    /api/v1/permissions?action=create - Filter by action
GET    /api/v1/permissions?subject=Story - Filter by subject
GET    /api/v1/permissions/:id    - Get permission
PUT    /api/v1/permissions/:id    - Update permission
DELETE /api/v1/permissions/:id    - Delete permission
```

### User Roles
```
GET    /api/v1/users/:userId/roles           - Get user's roles
POST   /api/v1/users/:userId/roles           - Assign role to user
DELETE /api/v1/users/:userId/roles/:roleId   - Revoke role from user
POST   /api/v1/users/:userId/roles/:roleId/activate   - Activate role
POST   /api/v1/users/:userId/roles/:roleId/deactivate - Deactivate role
```

## 🚀 CLI Commands

```bash
# Run migrations
npm run migration:run

# Seed default roles and permissions
npm run db:seed:acl

# Revert last migration
npm run migration:revert

# Build project
npm run build

# Start in development
npm run start:dev
```

## 💡 Pro Tips

1. **Super-admin role bypasses ALL checks**
   ```typescript
   // Super-admin gets instant access without DB queries
   // Check is done via JWT payload: user.role === 'super-admin'
   // No need to load userRoles or permissions
   ```

2. **Always use JwtAuthGuard before AbilityGuard**
   ```typescript
   @UseGuards(JwtAuthGuard, AbilityGuard) // Correct order
   ```

3. **Cache user abilities for performance**
   ```typescript
   // AbilityFactory already caches via RoleRepository
   // No manual caching needed
   ```

4. **Use subject instances for ownership checks**
   ```typescript
   ability.can(Action.Update, story) // ✅ Checks ownership
   ability.can(Action.Update, 'Story') // ❌ No ownership check
   ```

5. **System roles are protected**
   ```typescript
   // These operations will fail:
   - Delete system role
   - Change system role name
   - Set isSystem=false on system role
   - Remove all permissions from system role
   ```

6. **Role priority matters**
   ```typescript
   // Higher priority = more powerful
   super-admin: 100
   admin: 90
   moderator: 70
   user: 50
   guest: 10
   ```

## 📚 Further Reading

- [Full Documentation](./README.md)
- [Super Admin Access](../../SUPER_ADMIN_ACCESS.md)
- [CASL Documentation](https://casl.js.org/v6/en/)
- [NestJS Guards](https://docs.nestjs.com/guards)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
