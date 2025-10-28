import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Role } from '../entities/role.entity'
import { Permission } from '../entities/permission.entity'
import { RolePermission } from '../entities/role-permission.entity'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

/**
 * ACL Seeder - Create default roles and permissions
 * 
 * Run this after migrations to set up the default permission structure.
 * 
 * Default Roles:
 * - super-admin: Full system access (manage all)
 * - admin: Manage most resources, cannot manage roles/permissions
 * - moderator: Moderate content, read users
 * - user: CRUD own resources only
 * - guest: Read public resources only
 */
@Injectable()
export class AclSeeder {
  private readonly logger = new Logger(AclSeeder.name)

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
  ) {}

  /**
   * Run the seeder
   */
  async seed(): Promise<void> {
    this.logger.log('Starting ACL seeder...')

    // Create permissions first
    const permissions = await this.createPermissions()
    this.logger.log(`Created ${permissions.length} permissions`)

    // Create roles
    const roles = await this.createRoles()
    this.logger.log(`Created ${roles.length} roles`)

    // Assign permissions to roles
    await this.assignPermissions(roles, permissions)
    this.logger.log('Permissions assigned to roles')

    this.logger.log('ACL seeder completed successfully')
  }

  /**
   * Create all permissions
   */
  private async createPermissions(): Promise<Permission[]> {
    const permissionsData = [
      // Super Admin - Manage All
      { action: Action.Manage, subject: Subject.All, reason: 'Super admin full access' },

      // User permissions
      { action: Action.Create, subject: Subject.User, reason: 'Create new users' },
      { action: Action.Read, subject: Subject.User, reason: 'Read user data' },
      { action: Action.Update, subject: Subject.User, reason: 'Update user data' },
      { action: Action.Update, subject: Subject.User, conditions: { id: '${userId}' }, reason: 'Update own profile' },
      { action: Action.Delete, subject: Subject.User, reason: 'Delete users' },

      // Story permissions
      { action: Action.Create, subject: Subject.Story, reason: 'Create stories' },
      { action: Action.Read, subject: Subject.Story, reason: 'Read all stories' },
      { action: Action.Update, subject: Subject.Story, reason: 'Update any story' },
      { action: Action.Update, subject: Subject.Story, conditions: { userId: '${userId}' }, reason: 'Update own stories' },
      { action: Action.Delete, subject: Subject.Story, reason: 'Delete any story' },
      { action: Action.Delete, subject: Subject.Story, conditions: { userId: '${userId}' }, reason: 'Delete own stories' },
      { action: Action.Publish, subject: Subject.Story, reason: 'Publish stories' },
      { action: Action.Archive, subject: Subject.Story, reason: 'Archive stories' },
      { action: Action.Moderate, subject: Subject.Story, reason: 'Moderate stories' },

      // Attachment permissions
      { action: Action.Create, subject: Subject.Attachment, reason: 'Upload attachments' },
      { action: Action.Read, subject: Subject.Attachment, reason: 'Read all attachments' },
      { action: Action.Update, subject: Subject.Attachment, reason: 'Update any attachment' },
      { action: Action.Update, subject: Subject.Attachment, conditions: { userId: '${userId}' }, reason: 'Update own attachments' },
      { action: Action.Delete, subject: Subject.Attachment, reason: 'Delete any attachment' },
      { action: Action.Delete, subject: Subject.Attachment, conditions: { userId: '${userId}' }, reason: 'Delete own attachments' },

      // Category permissions
      { action: Action.Create, subject: Subject.Category, reason: 'Create categories' },
      { action: Action.Read, subject: Subject.Category, reason: 'Read categories' },
      { action: Action.Update, subject: Subject.Category, reason: 'Update categories' },
      { action: Action.Delete, subject: Subject.Category, reason: 'Delete categories' },

      // Tag permissions
      { action: Action.Create, subject: Subject.Tag, reason: 'Create tags' },
      { action: Action.Read, subject: Subject.Tag, reason: 'Read tags' },
      { action: Action.Update, subject: Subject.Tag, reason: 'Update tags' },
      { action: Action.Delete, subject: Subject.Tag, reason: 'Delete tags' },

      // Session permissions
      { action: Action.Read, subject: Subject.Session, conditions: { userId: '${userId}' }, reason: 'Read own sessions' },
      { action: Action.Delete, subject: Subject.Session, conditions: { userId: '${userId}' }, reason: 'Delete own sessions' },
      { action: Action.Read, subject: Subject.Session, reason: 'Read all sessions' },
      { action: Action.Delete, subject: Subject.Session, reason: 'Delete any session' },

      // Role permissions
      { action: Action.Create, subject: Subject.Role, reason: 'Create roles' },
      { action: Action.Read, subject: Subject.Role, reason: 'Read roles' },
      { action: Action.Update, subject: Subject.Role, reason: 'Update roles' },
      { action: Action.Delete, subject: Subject.Role, reason: 'Delete roles' },
      { action: Action.Assign, subject: Subject.Role, reason: 'Assign roles to users' },

      // Permission permissions
      { action: Action.Create, subject: Subject.Permission, reason: 'Create permissions' },
      { action: Action.Read, subject: Subject.Permission, reason: 'Read permissions' },
      { action: Action.Update, subject: Subject.Permission, reason: 'Update permissions' },
      { action: Action.Delete, subject: Subject.Permission, reason: 'Delete permissions' },

      // Country permissions
      { action: Action.Read, subject: Subject.Country, reason: 'Read countries' },
      { action: Action.Update, subject: Subject.Country, reason: 'Update countries' },

      // Setting permissions
      { action: Action.Read, subject: Subject.Setting, reason: 'Read settings' },
      { action: Action.Update, subject: Subject.Setting, reason: 'Update settings' },
    ]

    const permissions: Permission[] = []

    for (const permData of permissionsData) {
      // Check if permission already exists
      const existing = await this.permissionRepository.findOne({
        where: { action: permData.action, subject: permData.subject },
      })

      if (!existing) {
        const permission = this.permissionRepository.create({
          action: permData.action,
          subject: permData.subject,
          conditions: permData.conditions || {},
          fields: [],
          inverted: false,
          reason: permData.reason,
        })
        permissions.push(await this.permissionRepository.save(permission))
      } else {
        permissions.push(existing)
      }
    }

    return permissions
  }

  /**
   * Create default roles
   */
  private async createRoles(): Promise<Role[]> {
    const rolesData = [
      {
        name: 'super-admin',
        description: 'Super Administrator with full system access',
        isSystem: true,
        isActive: true,
        priority: 100,
      },
      {
        name: 'admin',
        description: 'Administrator with broad permissions',
        isSystem: true,
        isActive: true,
        priority: 90,
      },
      {
        name: 'moderator',
        description: 'Content moderator with moderation capabilities',
        isSystem: true,
        isActive: true,
        priority: 70,
      },
      {
        name: 'user',
        description: 'Regular user with standard permissions',
        isSystem: true,
        isActive: true,
        priority: 50,
      },
      {
        name: 'guest',
        description: 'Guest with read-only access to public content',
        isSystem: true,
        isActive: true,
        priority: 10,
      },
    ]

    const roles: Role[] = []

    for (const roleData of rolesData) {
      const existing = await this.roleRepository.findOne({
        where: { name: roleData.name },
      })

      if (!existing) {
        const role = this.roleRepository.create(roleData)
        roles.push(await this.roleRepository.save(role))
      } else {
        roles.push(existing)
      }
    }

    return roles
  }

  /**
   * Assign permissions to roles
   */
  private async assignPermissions(roles: Role[], permissions: Permission[]): Promise<void> {
    const roleMap = new Map(roles.map((r) => [r.name, r]))
    const permMap = new Map(
      permissions.map((p) => [`${p.action}:${p.subject}:${JSON.stringify(p.conditions)}`, p]),
    )

    // Helper to find permission
    const findPerm = (action: Action, subject: Subject, conditions: any = {}): Permission | undefined => {
      return permMap.get(`${action}:${subject}:${JSON.stringify(conditions)}`)
    }

    // Super Admin - gets manage all
    const superAdmin = roleMap.get('super-admin')!
    const manageAll = findPerm(Action.Manage, Subject.All)!
    await this.assignPermission(superAdmin, manageAll)

    // Admin - broad permissions except role/permission management
    const admin = roleMap.get('admin')!
    const adminPerms = permissions.filter(
      (p) =>
        p.subject !== Subject.Role &&
        p.subject !== Subject.Permission &&
        p.subject !== Subject.All &&
        !p.conditions?.userId, // No user-specific conditions
    )
    for (const perm of adminPerms) {
      await this.assignPermission(admin, perm)
    }

    // Moderator - moderate content, read users
    const moderator = roleMap.get('moderator')!
    const moderatorActions = [
      findPerm(Action.Read, Subject.User),
      findPerm(Action.Read, Subject.Story),
      findPerm(Action.Update, Subject.Story),
      findPerm(Action.Delete, Subject.Story),
      findPerm(Action.Moderate, Subject.Story),
      findPerm(Action.Publish, Subject.Story),
      findPerm(Action.Archive, Subject.Story),
      findPerm(Action.Read, Subject.Attachment),
      findPerm(Action.Update, Subject.Attachment),
      findPerm(Action.Delete, Subject.Attachment),
      findPerm(Action.Read, Subject.Category),
      findPerm(Action.Read, Subject.Tag),
      findPerm(Action.Read, Subject.Country),
      findPerm(Action.Read, Subject.Setting),
    ].filter(Boolean) as Permission[]
    for (const perm of moderatorActions) {
      await this.assignPermission(moderator, perm)
    }

    // User - own resources only
    const user = roleMap.get('user')!
    const userActions = [
      // Own profile
      findPerm(Action.Read, Subject.User, { id: '${userId}' }),
      findPerm(Action.Update, Subject.User, { id: '${userId}' }),
      // Own stories
      findPerm(Action.Create, Subject.Story),
      findPerm(Action.Read, Subject.Story),
      findPerm(Action.Update, Subject.Story, { userId: '${userId}' }),
      findPerm(Action.Delete, Subject.Story, { userId: '${userId}' }),
      // Own attachments
      findPerm(Action.Create, Subject.Attachment),
      findPerm(Action.Read, Subject.Attachment),
      findPerm(Action.Update, Subject.Attachment, { userId: '${userId}' }),
      findPerm(Action.Delete, Subject.Attachment, { userId: '${userId}' }),
      // Read public resources
      findPerm(Action.Read, Subject.Category),
      findPerm(Action.Read, Subject.Tag),
      findPerm(Action.Read, Subject.Country),
      // Own sessions
      findPerm(Action.Read, Subject.Session, { userId: '${userId}' }),
      findPerm(Action.Delete, Subject.Session, { userId: '${userId}' }),
    ].filter(Boolean) as Permission[]
    for (const perm of userActions) {
      await this.assignPermission(user, perm)
    }

    // Guest - read-only public access
    const guest = roleMap.get('guest')!
    const guestActions = [
      findPerm(Action.Read, Subject.Story),
      findPerm(Action.Read, Subject.Attachment),
      findPerm(Action.Read, Subject.Category),
      findPerm(Action.Read, Subject.Tag),
      findPerm(Action.Read, Subject.Country),
    ].filter(Boolean) as Permission[]
    for (const perm of guestActions) {
      await this.assignPermission(guest, perm)
    }
  }

  /**
   * Helper to assign permission to role
   */
  private async assignPermission(role: Role, permission: Permission): Promise<void> {
    const existing = await this.rolePermissionRepository.findOne({
      where: { roleId: role.id, permissionId: permission.id },
    })

    if (!existing) {
      const rolePermission = this.rolePermissionRepository.create({
        roleId: role.id,
        permissionId: permission.id,
      })
      await this.rolePermissionRepository.save(rolePermission)
    }
  }
}
