import { ExecutionContext, ForbiddenException } from '@nestjs/common'

import { Role } from '@modules/acl/entities/role.entity'
import { RoleHierarchyGuard } from '@modules/acl/guards/role-hierarchy.guard'
import { RoleRepository } from '@modules/acl/repositories/role.repository'
import { User } from '@modules/users/entities/user.entity'

describe('RoleHierarchyGuard', () => {
  let guard: RoleHierarchyGuard
  let mockLogger: jest.Mocked<any>
  let mockRoleRepository: { findById: jest.Mock }
  let eventBus: { publish: jest.Mock }
  let mockExecutionContext: ExecutionContext

  const superAdminRole: Role = { id: 1, name: 'super-admin', priority: 100, isActive: true } as Role
  const adminRole: Role = { id: 2, name: 'admin', priority: 80, isActive: true } as Role
  const moderatorRole: Role = { id: 3, name: 'moderator', priority: 60, isActive: true } as Role
  const userRole: Role = { id: 4, name: 'user', priority: 40, isActive: true } as Role

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }

    mockRoleRepository = {
      findById: jest.fn()
    }

    eventBus = { publish: jest.fn().mockResolvedValue(undefined) }
    guard = new RoleHierarchyGuard(
      mockLogger,
      mockRoleRepository as unknown as RoleRepository,
      eventBus
    )

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn()
      }),
      getHandler: jest.fn(),
      getClass: jest.fn()
    } as any
  })

  describe('canActivate', () => {
    it('should allow super-admin to bypass all checks', async () => {
      const superAdmin = new User()
      superAdmin.id = 'super-admin-id'
      superAdmin.primaryRole = superAdminRole
      superAdmin.userRoles = []

      const mockRequest = {
        user: superAdmin,
        body: { roleId: 1 },
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      const result = await guard.canActivate(mockExecutionContext)

      expect(result).toBe(true)
      expect(mockRoleRepository.findById).not.toHaveBeenCalled()
    })

    it('should throw ForbiddenException when no user in request', async () => {
      const mockRequest = {
        user: null as unknown,
        body: {},
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ForbiddenException)
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Authentication required'
      )
    })

    it('should allow when no roleId in request', async () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        body: {},
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      const result = await guard.canActivate(mockExecutionContext)

      expect(result).toBe(true)
      expect(mockRoleRepository.findById).not.toHaveBeenCalled()
    })

    it('should allow when target role not found', async () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        body: { roleId: 999 },
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(null)

      const result = await guard.canActivate(mockExecutionContext)

      expect(result).toBe(true)
    })

    it('should block assignment of super-admin role by non-super-admin', async () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        body: { roleId: 1 },
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(superAdminRole)

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ForbiddenException)
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        'Cannot assign or modify super-admin role'
      )
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ id: 'admin-id' }),
          request: expect.objectContaining({ endpoint: '/api/v1/user-roles' })
        })
      )
    })

    it('should allow admin to assign lower priority roles', async () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        body: { roleId: 4 },
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(userRole)

      const result = await guard.canActivate(mockExecutionContext)

      expect(result).toBe(true)
    })

    it('should block assignment of equal priority role', async () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        body: { roleId: 2 },
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(adminRole)

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ForbiddenException)
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Cannot assign role 'admin' - insufficient privileges"
      )
    })

    it('should block assignment of higher priority role', async () => {
      const moderator = new User()
      moderator.id = 'moderator-id'
      moderator.primaryRole = moderatorRole
      moderator.userRoles = []

      const mockRequest = {
        user: moderator,
        body: { roleId: 2 },
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(adminRole)

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ForbiddenException)
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Cannot assign role 'admin' - insufficient privileges"
      )
    })

    it('should read roleId from body', async () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        body: { roleId: 4 },
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(userRole)

      await guard.canActivate(mockExecutionContext)

      expect(mockRoleRepository.findById).toHaveBeenCalledWith(4, { bypassCache: true })
    })

    it('should read roleId from params.id', async () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        body: {},
        params: { id: 4 },
        url: '/api/v1/roles/4'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(userRole)

      await guard.canActivate(mockExecutionContext)

      expect(mockRoleRepository.findById).toHaveBeenCalledWith(4, { bypassCache: true })
    })

    it('should read roleId from params.roleId', async () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        body: {},
        params: { roleId: 4 },
        url: '/api/v1/user-roles/assign'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(userRole)

      await guard.canActivate(mockExecutionContext)

      expect(mockRoleRepository.findById).toHaveBeenCalledWith(4, { bypassCache: true })
    })

    it('should use highest priority role from user roles', async () => {
      const userWithAdminRole = new User()
      userWithAdminRole.id = 'user-id'
      userWithAdminRole.primaryRole = userRole
      userWithAdminRole.userRoles = [
        {
          role: adminRole,
          isActive: true,
          expiresAt: null
        } as any
      ]

      const mockRequest = {
        user: userWithAdminRole,
        body: { roleId: 3 },
        params: {},
        url: '/api/v1/user-roles'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)
      mockRoleRepository.findById.mockResolvedValue(moderatorRole)

      const result = await guard.canActivate(mockExecutionContext)

      expect(result).toBe(true)
    })
  })
})
