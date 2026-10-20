import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'

import { Role } from '@modules/acl/entities/role.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { SuperAdminGuard } from '@modules/acl/guards/super-admin.guard'
import { User } from '@modules/users/entities/user.entity'

describe('SuperAdminGuard', () => {
  const logger = { warn: jest.fn() }
  const guard = new SuperAdminGuard(logger as unknown as PinoLogger)
  const contextFor = (user?: User) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user, url: '/api/v1/admin/users/1', method: 'PATCH' })
      })
    }) as unknown as ExecutionContext

  const userWith = (primary: Role, extra: Role[] = []) =>
    Object.assign(new User(), {
      id: 'u1',
      email: 'someone@private.test',
      primaryRole: primary,
      userRoles: extra.map(role => ({ role, isActive: true, expiresAt: null }) as UserRole)
    })
  const role = (name: string, priority: number) => ({ id: priority, name, priority }) as Role

  beforeEach(() => jest.clearAllMocks())

  it('lets super-admins through, by primary or additional role', () => {
    expect(guard.canActivate(contextFor(userWith(role('super-admin', 100))))).toBe(true)
    expect(
      guard.canActivate(contextFor(userWith(role('user', 40), [role('super-admin', 100)])))
    ).toBe(true)
  })

  it('refuses everyone else, and logs the refusal without personal data', () => {
    expect(() => guard.canActivate(contextFor(userWith(role('admin', 80))))).toThrow(
      ForbiddenException
    )
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('someone@private.test')
  })

  it('refuses a request without a user', () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException)
  })
})
