# RBAC Enhancement Implementation Guide

**Reference**: [RBAC_ENHANCEMENT_ANALYSIS.md](./RBAC_ENHANCEMENT_ANALYSIS.md)  
**Branch**: `feature/rbac-enhancement`

---

## Quick Start

This guide provides step-by-step implementation details for enhancing the RBAC system.

---

## Phase 1: Core Role System Standardization

### Step 1.1: Database Migration

**File**: `src/core/database/migrations/1730900000001-AddPrimaryRoleToUsers.ts`

```typescript
import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm'

export class AddPrimaryRoleToUsers1730900000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add primary_role_id column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'primary_role_id',
        type: 'integer',
        isNullable: true
      })
    )

    // Add foreign key
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'fk_users_primary_role',
        columnNames: ['primary_role_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'roles',
        onDelete: 'SET NULL'
      })
    )

    // Migrate data: super-admin
    await queryRunner.query(`
      UPDATE users 
      SET primary_role_id = (SELECT id FROM roles WHERE name = 'super-admin' LIMIT 1)
      WHERE role = 'super-admin'
    `)

    // Migrate data: regular users
    await queryRunner.query(`
      UPDATE users 
      SET primary_role_id = (SELECT id FROM roles WHERE name = 'user' LIMIT 1)
      WHERE role = 'ROLE_USER' OR role IS NULL OR role = ''
    `)

    // Ensure user_roles entries exist
    await queryRunner.query(`
      INSERT INTO user_roles (user_id, role_id, is_active, expires_at, created_at, updated_at)
      SELECT u.id, u.primary_role_id, true, NULL, NOW(), NOW()
      FROM users u
      WHERE u.primary_role_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur 
          WHERE ur.user_id = u.id AND ur.role_id = u.primary_role_id
        )
    `)

    // Make primary_role_id NOT NULL after data migration
    await queryRunner.changeColumn(
      'users',
      'primary_role_id',
      new TableColumn({
        name: 'primary_role_id',
        type: 'integer',
        isNullable: false
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('users', 'fk_users_primary_role')
    await queryRunner.dropColumn('users', 'primary_role_id')
  }
}
```

### Step 1.2: Update User Entity

**File**: `src/modules/users/entities/user.entity.ts`

```typescript
import { Role } from '../../acl/entities/role.entity'

@Entity({ name: 'users' })
export class User {
  // ... existing fields ...

  @Column({ length: 20, default: 'ROLE_USER' })
  @Deprecated('Use primary_role_id and userRoles instead')
  role: string  // Keep for backward compatibility, mark deprecated

  @Column({ name: 'primary_role_id' })
  primaryRoleId: number

  @ManyToOne(() => Role, { eager: true })
  @JoinColumn({ name: 'primary_role_id' })
  primaryRole: Role

  @OneToMany(() => UserRole, userRole => userRole.user, { eager: true })
  userRoles: UserRole[]

  // ... existing fields ...

  /**
   * Get the primary role name
   */
  getPrimaryRoleName(): string {
    return this.primaryRole?.name || 'user'
  }

  /**
   * Get user's highest priority role
   */
  getHighestPriorityRole(): Role | null {
    if (!this.userRoles || this.userRoles.length === 0) {
      return this.primaryRole
    }

    const activeRoles = this.userRoles
      .filter(ur => ur.isActive && ur.role && (!ur.expiresAt || ur.expiresAt > new Date()))
      .map(ur => ur.role)

    if (activeRoles.length === 0) {
      return this.primaryRole
    }

    return activeRoles.reduce((highest, role) => 
      role.priority > (highest?.priority || 0) ? role : highest
    )
  }

  /**
   * Check if user has a specific role
   */
  hasRole(roleName: string): boolean {
    // Check primary role
    if (this.primaryRole?.name === roleName) {
      return true
    }

    // Check user roles
    if (!this.userRoles) {
      return false
    }

    const now = new Date()
    return this.userRoles.some(
      userRole =>
        userRole.role.name === roleName &&
        userRole.isActive &&
        (!userRole.expiresAt || userRole.expiresAt > now)
    )
  }

  /**
   * Get all active role names for this user
   */
  getRoles(): string[] {
    const roles = new Set<string>()

    // Add primary role
    if (this.primaryRole) {
      roles.add(this.primaryRole.name)
    }

    // Add user roles
    if (this.userRoles) {
      const now = new Date()
      this.userRoles
        .filter(userRole => userRole.isActive && (!userRole.expiresAt || userRole.expiresAt > now))
        .forEach(userRole => roles.add(userRole.role.name))
    }

    return Array.from(roles)
  }

  /**
   * Check if user is a super admin
   */
  isSuperAdmin(): boolean {
    return this.hasRole('super-admin')
  }

  /**
   * Check if user is an admin (including super-admin)
   */
  isAdmin(): boolean {
    return this.hasRole('admin') || this.isSuperAdmin()
  }

  /**
   * Check if user can manage another user based on role hierarchy
   */
  canManageUser(targetUser: User): boolean {
    if (this.isSuperAdmin()) {
      return true  // Super admin can manage anyone
    }

    const myPriority = this.getHighestPriorityRole()?.priority || 0
    const targetPriority = targetUser.getHighestPriorityRole()?.priority || 0

    // Can only manage users with lower priority
    return myPriority > targetPriority
  }

  /**
   * Check if user can assign a specific role
   */
  canAssignRole(role: Role): boolean {
    if (this.isSuperAdmin()) {
      return true  // Super admin can assign any role
    }

    // Cannot assign super-admin role
    if (role.name === 'super-admin') {
      return false
    }

    const myPriority = this.getHighestPriorityRole()?.priority || 0

    // Can only assign roles with lower priority
    return myPriority > role.priority
  }
}
```

### Step 1.3: Update JWT Strategy

**File**: `src/modules/auth/strategies/jwt.strategy.ts`

```typescript
async validate(payload: JwtPayload): Promise<User> {
  const user = await this.usersRepository.findOne({
    where: { id: payload.sub },
    relations: ['primaryRole', 'userRoles', 'userRoles.role']
  })

  if (!user || !user.isActive) {
    throw new UnauthorizedException('User not found or inactive')
  }

  // Add role information to JWT payload for quick access
  // But always rely on database for authoritative role data
  return user
}
```

### Step 1.4: Update Auth Service (Token Generation)

**File**: `src/modules/auth/services/auth.service.ts`

```typescript
private async generateAccessToken(user: User): Promise<string> {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    // Use primary role for quick checks, but guards should always verify via database
    role: user.getPrimaryRoleName(),
    roles: user.getRoles(),
    iat: Math.floor(Date.now() / 1000)
  }

  return this.jwtService.signAsync(payload, {
    secret: this.configService.get<string>('auth.jwtSecret'),
    expiresIn: this.configService.get<string>('auth.accessTokenTtl')
  })
}
```

---

## Phase 2: Super-Admin Guards

### Step 2.1: Create SuperAdminGuard

**File**: `src/modules/acl/guards/super-admin.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { User } from '@modules/users/entities/user.entity'

/**
 * Guard to restrict access to super-admin users only
 * 
 * Usage:
 * @UseGuards(JwtAuthGuard, SuperAdminGuard)
 * 
 * IMPORTANT: Must be used AFTER JwtAuthGuard
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(SuperAdminGuard.name)
    private readonly logger: PinoLogger,
    private reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user: User = request.user

    if (!user) {
      this.logger.warn('SuperAdminGuard: No user in request')
      throw new ForbiddenException('Authentication required')
    }

    // Check using User entity methods (authoritative)
    const isSuperAdmin = user.isSuperAdmin()

    if (!isSuperAdmin) {
      this.logger.warn(
        {
          userId: user.id,
          email: user.email,
          primaryRole: user.getPrimaryRoleName(),
          path: request.url,
          method: request.method
        },
        'SuperAdminGuard: Access denied - super-admin required'
      )

      throw new ForbiddenException('Super Admin access required')
    }

    this.logger.info(
      {
        userId: user.id,
        email: user.email,
        path: request.url,
        method: request.method
      },
      'SuperAdminGuard: Access granted'
    )

    return true
  }
}
```

### Step 2.2: Create RoleHierarchyGuard

**File**: `src/modules/acl/guards/role-hierarchy.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino'
import { Role } from '../entities/role.entity'
import { User } from '@modules/users/entities/user.entity'

/**
 * Guard to enforce role hierarchy rules
 * Prevents users from assigning roles equal to or higher than their own
 * 
 * Usage:
 * @UseGuards(JwtAuthGuard, AbilityGuard, RoleHierarchyGuard)
 * 
 * Checks request body for: roleId
 * Checks request params for: id (when modifying roles)
 */
@Injectable()
export class RoleHierarchyGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(RoleHierarchyGuard.name)
    private readonly logger: PinoLogger,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const user: User = request.user
    const body = request.body
    const params = request.params

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }

    // Super-admin bypasses all hierarchy checks
    if (user.isSuperAdmin()) {
      this.logger.info({ userId: user.id }, 'RoleHierarchyGuard: Super-admin bypass')
      return true
    }

    // Get target role being assigned/modified
    const targetRoleId = body.roleId || params.id || params.roleId
    if (!targetRoleId) {
      // No role in request, allow (let controller validate)
      return true
    }

    const targetRole = await this.roleRepository.findOne({ 
      where: { id: targetRoleId } 
    })

    if (!targetRole) {
      // Role not found, let controller handle
      return true
    }

    // CRITICAL: Prevent assigning super-admin role
    if (targetRole.name === 'super-admin') {
      this.logger.warn(
        {
          userId: user.id,
          targetRoleId,
          targetRoleName: targetRole.name,
          path: request.url
        },
        'RoleHierarchyGuard: Blocked super-admin role assignment attempt'
      )

      throw new ForbiddenException('Cannot assign or modify super-admin role')
    }

    // Get user's highest priority
    const userHighestRole = user.getHighestPriorityRole()
    const userMaxPriority = userHighestRole?.priority || 0

    // Can only assign roles with lower priority
    if (targetRole.priority >= userMaxPriority) {
      this.logger.warn(
        {
          userId: user.id,
          userPriority: userMaxPriority,
          targetRolePriority: targetRole.priority,
          targetRoleName: targetRole.name
        },
        'RoleHierarchyGuard: Blocked - insufficient priority'
      )

      throw new ForbiddenException(
        `Cannot assign role '${targetRole.name}' - insufficient privileges`
      )
    }

    this.logger.info(
      {
        userId: user.id,
        userPriority: userMaxPriority,
        targetRolePriority: targetRole.priority,
        targetRoleName: targetRole.name
      },
      'RoleHierarchyGuard: Hierarchy check passed'
    )

    return true
  }
}
```

### Step 2.3: Create AdminOrOwnerGuard (Bonus)

**File**: `src/modules/acl/guards/admin-or-owner.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User } from '@modules/users/entities/user.entity'

/**
 * Guard to allow access if user is admin OR owns the resource
 * 
 * Usage:
 * @UseGuards(JwtAuthGuard, AdminOrOwnerGuard)
 * @SetMetadata('resourceUserIdParam', 'userId')  // which param contains the resource owner ID
 * 
 * Example:
 * GET /users/:userId/profile
 * - Admin can access any userId
 * - Regular user can only access their own userId
 */
@Injectable()
export class AdminOrOwnerGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user: User = request.user

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }

    // Admin/Super-admin can access anything
    if (user.isAdmin() || user.isSuperAdmin()) {
      return true
    }

    // Get the parameter name that contains the resource owner's user ID
    const resourceUserIdParam = this.reflector.get<string>(
      'resourceUserIdParam',
      context.getHandler()
    ) || 'userId'

    const resourceUserId = request.params[resourceUserIdParam] || request.body?.userId

    // Check if user owns the resource
    if (resourceUserId && resourceUserId === user.id) {
      return true
    }

    throw new ForbiddenException('Access denied - admin access or ownership required')
  }
}
```

### Step 2.4: Export Guards

**File**: `src/modules/acl/guards/index.ts`

```typescript
export * from './super-admin.guard'
export * from './role-hierarchy.guard'
export * from './admin-or-owner.guard'
export * from './ability.guard'
```

### Step 2.5: Register Guards in ACL Module

**File**: `src/modules/acl/acl.module.ts`

```typescript
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Role, Permission, RolePermission, UserRole } from './entities'
import { SuperAdminGuard, RoleHierarchyGuard, AdminOrOwnerGuard } from './guards'
// ... other imports

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission, RolePermission, UserRole])
  ],
  providers: [
    // ... existing providers
    SuperAdminGuard,
    RoleHierarchyGuard,
    AdminOrOwnerGuard
  ],
  exports: [
    // ... existing exports
    SuperAdminGuard,
    RoleHierarchyGuard,
    AdminOrOwnerGuard,
    TypeOrmModule
  ]
})
export class AclModule {}
```

---

## Phase 3: Apply Guards to Controllers

### Step 3.1: ACL Management (Super-Admin Only)

**File**: `src/modules/acl/controllers/roles.controller.ts`

```typescript
import { SuperAdminGuard } from '../guards'

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('v1/roles')
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // ✅ Add SuperAdminGuard
export class RolesController {
  // All role management now requires super-admin
  // Remove individual @CheckAbility decorators or keep for documentation
}
```

**File**: `src/modules/acl/controllers/permissions.controller.ts`

```typescript
import { SuperAdminGuard } from '../guards'

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('v1/permissions')
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // ✅ Add SuperAdminGuard
export class PermissionsController {
  // All permission management now requires super-admin
}
```

### Step 3.2: User Role Assignment (Hierarchy Check)

**File**: `src/modules/users/controllers/user-roles.controller.ts`

```typescript
import { RoleHierarchyGuard } from '@modules/acl/guards'

@ApiTags('User Roles')
@ApiBearerAuth()
@Controller('v1/users/:userId/roles')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class UserRolesController {
  // ... other methods ...

  @Post()
  @UseGuards(RoleHierarchyGuard)  // ✅ Add RoleHierarchyGuard for this endpoint
  @CheckAbility({ action: Action.Assign, subject: Subject.Role })
  @ApiOperation({ summary: 'Assign a role to a user' })
  async assignRole(@Param('userId') userId: string, @Body() assignRoleDto: AssignRoleDto) {
    return this.userRolesService.assignRole(userId, assignRoleDto)
  }

  @Delete(':roleId')
  @UseGuards(RoleHierarchyGuard)  // ✅ Add RoleHierarchyGuard for this endpoint
  @CheckAbility({ action: Action.Assign, subject: Subject.Role })
  async revokeRole(@Param('userId') userId: string, @Param('roleId', ParseIntPipe) roleId: number) {
    await this.userRolesService.revokeRole(userId, roleId)
  }
}
```

### Step 3.3: Admin Password Management (Super-Admin Only)

**File**: `src/modules/users/controllers/admin-users.controller.ts`

```typescript
import { SuperAdminGuard } from '@modules/acl/guards'

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // ✅ Replace AbilityGuard with SuperAdminGuard
export class AdminUsersController {
  // Remove @CheckAbility decorators - SuperAdminGuard handles it
  
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  // @CheckAbility({ action: Action.Update, subject: Subject.User })  // ❌ Remove this
  @ApiOperation({ summary: 'Reset user password (super-admin only)' })
  async resetPassword(@Body() dto: AdminResetPasswordDto, @Request() req) {
    return this.adminPasswordService.resetPassword(dto, req.user.id, req.user.email)
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  // @CheckAbility({ action: Action.Update, subject: Subject.User })  // ❌ Remove this
  @ApiOperation({ summary: 'Set user password (super-admin only)' })
  async setPassword(@Body() dto: AdminSetPasswordDto, @Request() req) {
    return this.adminPasswordService.setPassword(dto, req.user.id, req.user.email)
  }
}
```

### Step 3.4: Audit Logs (Super-Admin Only)

**File**: `src/modules/audit/controllers/audit.controller.ts`

```typescript
import { SuperAdminGuard } from '@modules/acl/guards'

@ApiTags('Audit Logs')
@Controller('audit')
@UseGuards(JwtAuthGuard, SuperAdminGuard)  // ✅ Replace AbilityGuard with SuperAdminGuard
@ApiBearerAuth()
export class AuditController {
  // All audit log access now requires super-admin
  // Remove individual @CheckAbility decorators
}
```

### Step 3.5: Session Cleanup (Super-Admin Only)

**File**: `src/modules/auth/controllers/sessions.controller.ts`

```typescript
import { SuperAdminGuard } from '@modules/acl/guards'

@ApiTags('sessions')
@Controller('v1/sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SessionsController {
  // ... other methods ...

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)  // ✅ Add SuperAdminGuard
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Manual cleanup (super-admin only)' })
  async manualCleanup(
    @Query('olderThanDays') olderThanDays: number = 30,
    @Req() req: AuthenticatedRequest
  ) {
    // ❌ Remove this check:
    // if (user?.role !== 'admin') {
    //   throw new ForbiddenException('Admin access required')
    // }

    // SuperAdminGuard handles authorization
    const user = req.user
    
    this.logger.info(
      { adminUserId: user.userId, olderThanDays, action: 'manual_cleanup' },
      'Starting cleanup'
    )

    // ... rest of method
  }
}
```

---

## Phase 4: Enhanced Services

### Step 4.1: Add User Protection to UsersService

**File**: `src/modules/users/services/users.service.ts`

```typescript
async update(id: string, updateDto: UpdateUserDto, currentUser: User): Promise<User> {
  const targetUser = await this.findOne(id)

  if (!targetUser) {
    throw new NotFoundException(`User with ID ${id} not found`)
  }

  // ✅ Protect super-admin users from non-super-admin modifications
  if (targetUser.isSuperAdmin() && !currentUser.isSuperAdmin()) {
    this.logger.warn(
      {
        currentUserId: currentUser.id,
        targetUserId: id,
        action: 'update_user_blocked'
      },
      'Attempted to modify super-admin user'
    )
    throw new ForbiddenException('Cannot modify super-admin users')
  }

  // ✅ Check role hierarchy for user management
  if (!currentUser.canManageUser(targetUser)) {
    throw new ForbiddenException('Cannot modify users with equal or higher role priority')
  }

  // ... rest of update logic
}

async delete(id: string, currentUser: User): Promise<void> {
  const targetUser = await this.findOne(id)

  if (!targetUser) {
    throw new NotFoundException(`User with ID ${id} not found`)
  }

  // ✅ Protect super-admin users
  if (targetUser.isSuperAdmin() && !currentUser.isSuperAdmin()) {
    throw new ForbiddenException('Cannot delete super-admin users')
  }

  if (!currentUser.canManageUser(targetUser)) {
    throw new ForbiddenException('Cannot delete users with equal or higher role priority')
  }

  // ... rest of delete logic
}
```

### Step 4.2: Add Audit Logging to Role Assignment

**File**: `src/modules/users/services/user-roles.service.ts`

```typescript
import { AuditService } from '@modules/audit/services/audit.service'
import { AuditAction } from '@modules/audit/entities/audit-log.entity'

@Injectable()
export class UserRolesService {
  constructor(
    // ... existing dependencies
    private readonly auditService: AuditService
  ) {}

  async assignRole(userId: string, dto: AssignRoleDto, currentUser?: User): Promise<any> {
    // ... existing logic ...

    // ✅ Add audit log entry
    await this.auditService.log({
      action: AuditAction.ROLE_ASSIGNED,
      userId: currentUser?.id || 'system',
      entityType: 'UserRole',
      entityId: userRole.id,
      metadata: {
        targetUserId: userId,
        roleId: dto.roleId,
        roleName: role.name,
        expiresAt: dto.expiresAt,
        assignedBy: currentUser?.email || 'system'
      },
      severity: 'high',  // Role changes are high severity
      ipAddress: currentUser?.lastLoginIp || 'unknown',
      userAgent: 'API'
    })

    return { success: true, userRole }
  }

  async revokeRole(userId: string, roleId: number, currentUser?: User): Promise<void> {
    // ... existing logic ...

    // ✅ Add audit log entry
    await this.auditService.log({
      action: AuditAction.ROLE_REVOKED,
      userId: currentUser?.id || 'system',
      entityType: 'UserRole',
      entityId: userRole.id,
      metadata: {
        targetUserId: userId,
        roleId,
        roleName: userRole.role.name,
        revokedBy: currentUser?.email || 'system'
      },
      severity: 'high',
      ipAddress: currentUser?.lastLoginIp || 'unknown',
      userAgent: 'API'
    })
  }
}
```

---

## Testing Guide

### Unit Tests for Guards

**File**: `src/modules/acl/guards/__tests__/super-admin.guard.spec.ts`

```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { SuperAdminGuard } from '../super-admin.guard'
import { User } from '@modules/users/entities/user.entity'
import { Role } from '../../entities/role.entity'

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard
  let mockReflector: Reflector

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SuperAdminGuard,
        {
          provide: Reflector,
          useValue: { get: jest.fn() }
        },
        {
          provide: 'PinoLogger',
          useValue: { info: jest.fn(), warn: jest.fn() }
        }
      ]
    }).compile()

    guard = module.get<SuperAdminGuard>(SuperAdminGuard)
    mockReflector = module.get<Reflector>(Reflector)
  })

  const createMockContext = (user: any): ExecutionContext => ({
    switchToHttp: () => ({
      getRequest: () => ({ user })
    })
  } as any)

  it('should allow super-admin users', () => {
    const superAdminRole = { name: 'super-admin', priority: 100 } as Role
    const user = { 
      id: '1', 
      primaryRole: superAdminRole,
      isSuperAdmin: () => true 
    } as User

    const context = createMockContext(user)
    expect(guard.canActivate(context)).toBe(true)
  })

  it('should block non-super-admin users', () => {
    const adminRole = { name: 'admin', priority: 90 } as Role
    const user = { 
      id: '2', 
      primaryRole: adminRole,
      isSuperAdmin: () => false 
    } as User

    const context = createMockContext(user)
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
  })

  it('should block when no user in request', () => {
    const context = createMockContext(null)
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
  })
})
```

### E2E Tests for Protected Endpoints

**File**: `test/integration/acl/super-admin-protection.e2e-spec.ts`

```typescript
import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '@/app.module'

describe('Super Admin Protection (e2e)', () => {
  let app: INestApplication
  let superAdminToken: string
  let adminToken: string
  let userToken: string

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()

    // Login as different users
    superAdminToken = await loginUser('superadmin@test.com', 'password')
    adminToken = await loginUser('admin@test.com', 'password')
    userToken = await loginUser('user@test.com', 'password')
  })

  describe('POST /v1/roles', () => {
    it('should allow super-admin to create role', () => {
      return request(app.getHttpServer())
        .post('/v1/roles')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'new-role', description: 'Test role' })
        .expect(201)
    })

    it('should block admin from creating role', () => {
      return request(app.getHttpServer())
        .post('/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'new-role', description: 'Test role' })
        .expect(403)
    })

    it('should block regular user from creating role', () => {
      return request(app.getHttpServer())
        .post('/v1/roles')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'new-role', description: 'Test role' })
        .expect(403)
    })
  })

  describe('POST /admin/users/reset-password', () => {
    it('should allow super-admin to reset password', () => {
      return request(app.getHttpServer())
        .post('/admin/users/reset-password')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ userId: 'some-user-id' })
        .expect(200)
    })

    it('should block admin from resetting password', () => {
      return request(app.getHttpServer())
        .post('/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: 'some-user-id' })
        .expect(403)
    })
  })

  // Add more tests for other protected endpoints
})
```

---

## Rollback Plan

If issues occur in production:

1. **Immediate**: Disable new guards via feature flag
   ```typescript
   // In guard
   const featureEnabled = this.configService.get('features.enhancedRbac', false)
   if (!featureEnabled) return true  // Bypass
   ```

2. **Data Rollback**: Revert to legacy `user.role` column
   ```sql
   -- Restore role column usage
   UPDATE users SET role = pr.name
   FROM roles pr
   WHERE users.primary_role_id = pr.id;
   ```

3. **Code Rollback**: Remove guard decorators from controllers
   ```bash
   git revert <commit-hash>
   ```

---

## Deployment Checklist

- [ ] Database migration tested on staging
- [ ] All unit tests pass
- [ ] All e2e tests pass
- [ ] Guards registered in modules
- [ ] Controllers updated with new guards
- [ ] JWT strategy updated
- [ ] Existing admin users notified of permission changes
- [ ] Documentation updated
- [ ] Rollback plan tested
- [ ] Feature flag configured (optional)
- [ ] Monitoring alerts configured for 403 errors
- [ ] Audit logs verified for role changes

---

## Next Steps

1. Review this implementation guide
2. Create feature branch from `feature/rbac-enhancement`
3. Implement Phase 1 (migrations)
4. Test migrations on local database
5. Implement Phase 2 (guards)
6. Write unit tests for guards
7. Apply guards to controllers (Phase 3)
8. Write e2e tests
9. Code review
10. Deploy to staging
11. Security testing
12. Deploy to production

