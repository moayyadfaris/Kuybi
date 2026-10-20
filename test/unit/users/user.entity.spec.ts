import { Role } from '@modules/acl/entities/role.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { User } from '@modules/users/entities/user.entity'

describe('User Entity', () => {
  let superAdminRole: Role
  let adminRole: Role
  let moderatorRole: Role
  let userRole: Role

  beforeEach(() => {
    // Setup roles with proper hierarchy
    superAdminRole = { id: 1, name: 'super-admin', priority: 100 } as Role
    adminRole = { id: 2, name: 'admin', priority: 80 } as Role
    moderatorRole = { id: 3, name: 'moderator', priority: 60 } as Role
    userRole = { id: 4, name: 'user', priority: 40 } as Role
  })

  describe('getPrimaryRoleName', () => {
    it('should return primary role name when primaryRole exists', () => {
      const user = new User()
      user.primaryRole = adminRole

      expect(user.getPrimaryRoleName()).toBe('admin')
    })

    it('should return "user" as default when primaryRole is null', () => {
      const user = new User()
      user.primaryRole = null as unknown as Role // relation not loaded

      expect(user.getPrimaryRoleName()).toBe('user')
    })
  })

  describe('getHighestPriorityRole', () => {
    it('should return primary role when no user roles exist', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = []

      expect(user.getHighestPriorityRole()).toBe(userRole)
    })

    it('should return primary role when userRoles is undefined', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = undefined as unknown as UserRole[] // relation not loaded

      expect(user.getHighestPriorityRole()).toBe(userRole)
    })

    it('should return highest priority role from user roles', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = [
        {
          role: moderatorRole,
          isActive: true,
          expiresAt: null
        } as UserRole,
        {
          role: adminRole,
          isActive: true,
          expiresAt: null
        } as UserRole
      ]

      expect(user.getHighestPriorityRole()).toBe(adminRole)
    })

    it('should filter out inactive roles', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = [
        {
          role: adminRole,
          isActive: false,
          expiresAt: null
        } as UserRole,
        {
          role: moderatorRole,
          isActive: true,
          expiresAt: null
        } as UserRole
      ]

      expect(user.getHighestPriorityRole()).toBe(moderatorRole)
    })

    it('should filter out expired roles', () => {
      const pastDate = new Date('2020-01-01')
      const futureDate = new Date('2030-01-01')

      const user = new User()
      user.primaryRole = userRole
      user.userRoles = [
        {
          role: adminRole,
          isActive: true,
          expiresAt: pastDate
        } as UserRole,
        {
          role: moderatorRole,
          isActive: true,
          expiresAt: futureDate
        } as UserRole
      ]

      expect(user.getHighestPriorityRole()).toBe(moderatorRole)
    })

    it('should return primary role when all user roles are inactive or expired', () => {
      const pastDate = new Date('2020-01-01')

      const user = new User()
      user.primaryRole = userRole
      user.userRoles = [
        {
          role: adminRole,
          isActive: false,
          expiresAt: null
        } as UserRole,
        {
          role: moderatorRole,
          isActive: true,
          expiresAt: pastDate
        } as UserRole
      ]

      expect(user.getHighestPriorityRole()).toBe(userRole)
    })
  })

  describe('hasRole', () => {
    it('should return true when user has role as primary role', () => {
      const user = new User()
      user.primaryRole = adminRole
      user.userRoles = []

      expect(user.hasRole('admin')).toBe(true)
    })

    it('should return true when user has role in user roles', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = [
        {
          role: moderatorRole,
          isActive: true,
          expiresAt: null
        } as UserRole
      ]

      expect(user.hasRole('moderator')).toBe(true)
    })

    it('should return false when user does not have role', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = []

      expect(user.hasRole('admin')).toBe(false)
    })

    it('should return false when role is inactive', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = [
        {
          role: adminRole,
          isActive: false,
          expiresAt: null
        } as UserRole
      ]

      expect(user.hasRole('admin')).toBe(false)
    })

    it('should return false when role is expired', () => {
      const pastDate = new Date('2020-01-01')

      const user = new User()
      user.primaryRole = userRole
      user.userRoles = [
        {
          role: adminRole,
          isActive: true,
          expiresAt: pastDate
        } as UserRole
      ]

      expect(user.hasRole('admin')).toBe(false)
    })

    it('should return false when userRoles is undefined', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = undefined as unknown as UserRole[] // relation not loaded

      expect(user.hasRole('admin')).toBe(false)
    })
  })

  describe('isSuperAdmin', () => {
    it('should return true when user has super-admin as primary role', () => {
      const user = new User()
      user.primaryRole = superAdminRole
      user.userRoles = []

      expect(user.isSuperAdmin()).toBe(true)
    })

    it('should return true when user has super-admin in user roles', () => {
      const user = new User()
      user.primaryRole = userRole
      user.userRoles = [
        {
          role: superAdminRole,
          isActive: true,
          expiresAt: null
        } as UserRole
      ]

      expect(user.isSuperAdmin()).toBe(true)
    })

    it('should return false when user is not super-admin', () => {
      const user = new User()
      user.primaryRole = adminRole
      user.userRoles = []

      expect(user.isSuperAdmin()).toBe(false)
    })
  })

  describe('canManageUser', () => {
    it('should return true when super-admin manages anyone', () => {
      const superAdmin = new User()
      superAdmin.primaryRole = superAdminRole
      superAdmin.userRoles = []

      const otherSuperAdmin = new User()
      otherSuperAdmin.primaryRole = superAdminRole
      otherSuperAdmin.userRoles = []

      expect(superAdmin.canManageUser(otherSuperAdmin)).toBe(true)
    })

    it('should return true when admin manages regular user', () => {
      const admin = new User()
      admin.primaryRole = adminRole
      admin.userRoles = []

      const regularUser = new User()
      regularUser.primaryRole = userRole
      regularUser.userRoles = []

      expect(admin.canManageUser(regularUser)).toBe(true)
    })

    it('should return false when regular user tries to manage admin', () => {
      const regularUser = new User()
      regularUser.primaryRole = userRole
      regularUser.userRoles = []

      const admin = new User()
      admin.primaryRole = adminRole
      admin.userRoles = []

      expect(regularUser.canManageUser(admin)).toBe(false)
    })

    it('should return false when users have equal priority', () => {
      const user1 = new User()
      user1.primaryRole = userRole
      user1.userRoles = []

      const user2 = new User()
      user2.primaryRole = userRole
      user2.userRoles = []

      expect(user1.canManageUser(user2)).toBe(false)
    })

    it('should return true when moderator manages regular user', () => {
      const moderator = new User()
      moderator.primaryRole = moderatorRole
      moderator.userRoles = []

      const regularUser = new User()
      regularUser.primaryRole = userRole
      regularUser.userRoles = []

      expect(moderator.canManageUser(regularUser)).toBe(true)
    })

    it('should consider highest priority role from user roles', () => {
      const regularUserWithAdminRole = new User()
      regularUserWithAdminRole.primaryRole = userRole
      regularUserWithAdminRole.userRoles = [
        {
          role: adminRole,
          isActive: true,
          expiresAt: null
        } as UserRole
      ]

      const moderator = new User()
      moderator.primaryRole = moderatorRole
      moderator.userRoles = []

      expect(regularUserWithAdminRole.canManageUser(moderator)).toBe(true)
    })
  })
})
