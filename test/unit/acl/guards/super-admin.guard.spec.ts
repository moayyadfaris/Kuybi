import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { Role } from '@modules/acl/entities/role.entity'
import { SuperAdminGuard } from '@modules/acl/guards/super-admin.guard'
import { User } from '@modules/users/entities/user.entity'

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard
  let mockLogger: any
  let reflector: Reflector
  let mockExecutionContext: ExecutionContext

  const superAdminRole: Role = { id: 1, name: 'super-admin', priority: 100 } as Role
  const adminRole: Role = { id: 2, name: 'admin', priority: 80 } as Role
  const userRole: Role = { id: 4, name: 'user', priority: 40 } as Role

  beforeEach(() => {
    // Mock PinoLogger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }

    reflector = new Reflector()
    guard = new SuperAdminGuard(mockLogger, reflector)

    // Mock ExecutionContext
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn()
      }),
      getHandler: jest.fn(),
      getClass: jest.fn()
    } as any
  })

  describe('canActivate', () => {
    it('should allow access for super-admin user', () => {
      const superAdmin = new User()
      superAdmin.id = 'super-admin-id'
      superAdmin.email = 'superadmin@test.com'
      superAdmin.primaryRole = superAdminRole
      superAdmin.userRoles = []

      const mockRequest = {
        user: superAdmin,
        url: '/api/v1/admin/users',
        method: 'GET'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      const result = guard.canActivate(mockExecutionContext)

      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          userId: superAdmin.id,
          email: superAdmin.email,
          path: mockRequest.url,
          method: mockRequest.method
        },
        'SuperAdminGuard: Access granted'
      )
    })

    it('should deny access for admin user', () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.email = 'admin@test.com'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        url: '/api/v1/admin/users',
        method: 'GET'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockExecutionContext)).toThrow('Super Admin access required')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: admin.id,
          email: admin.email,
          primaryRole: 'admin'
        }),
        'SuperAdminGuard: Access denied - super-admin required'
      )
    })

    it('should deny access for regular user', () => {
      const regularUser = new User()
      regularUser.id = 'user-id'
      regularUser.email = 'user@test.com'
      regularUser.primaryRole = userRole
      regularUser.userRoles = []

      const mockRequest = {
        user: regularUser,
        url: '/api/v1/admin/users',
        method: 'GET'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockExecutionContext)).toThrow('Super Admin access required')
    })

    it('should throw ForbiddenException when no user in request', () => {
      const mockRequest = {
        user: null,
        url: '/api/v1/admin/users',
        method: 'GET'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockExecutionContext)).toThrow('Authentication required')

      expect(mockLogger.warn).toHaveBeenCalledWith('SuperAdminGuard: No user in request')
    })

    it('should throw ForbiddenException when user is undefined', () => {
      const mockRequest = {
        user: undefined,
        url: '/api/v1/admin/users',
        method: 'GET'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(ForbiddenException)
      expect(() => guard.canActivate(mockExecutionContext)).toThrow('Authentication required')
    })

    it('should allow access for user with super-admin in user roles', () => {
      const userWithSuperAdminRole = new User()
      userWithSuperAdminRole.id = 'user-id'
      userWithSuperAdminRole.email = 'user@test.com'
      userWithSuperAdminRole.primaryRole = userRole
      userWithSuperAdminRole.userRoles = [
        {
          role: superAdminRole,
          isActive: true,
          expiresAt: null
        } as any
      ]

      const mockRequest = {
        user: userWithSuperAdminRole,
        url: '/api/v1/admin/users',
        method: 'POST'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      const result = guard.canActivate(mockExecutionContext)

      expect(result).toBe(true)
      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('should log request details when denying access', () => {
      const admin = new User()
      admin.id = 'admin-id'
      admin.email = 'admin@test.com'
      admin.primaryRole = adminRole
      admin.userRoles = []

      const mockRequest = {
        user: admin,
        url: '/api/v1/sessions/users/some-id',
        method: 'DELETE'
      }

      ;(mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue(mockRequest)

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(ForbiddenException)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/v1/sessions/users/some-id',
          method: 'DELETE'
        }),
        'SuperAdminGuard: Access denied - super-admin required'
      )
    })
  })
})
