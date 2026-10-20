import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { AbilityFactory } from '@modules/acl/abilities/ability.factory'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { Permission } from '@modules/acl/entities/permission.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { User } from '@modules/users/entities/user.entity'

class Routes {
  @CheckAbility({ action: Action.Read, subject: Subject.Story })
  read() {}

  undecorated() {}
}

@CheckAbility({ action: Action.Read, subject: Subject.Tag })
class ClassLevel {
  list() {}
}

describe('AbilityGuard', () => {
  const guard = new AbilityGuard(new Reflector(), new AbilityFactory())
  const readStory = { action: Action.Read, subject: Subject.Story } as Permission
  const reader = Object.assign(new User(), {
    id: 'u1',
    primaryRole: {
      name: 'reader',
      isActive: true,
      rolePermissions: [{ permission: readStory }]
    } as unknown as Role,
    userRoles: []
  })
  const contextFor = (cls: new () => object, handler: string, user?: User) =>
    ({
      getHandler: () => (cls.prototype as Record<string, unknown>)[handler],
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => ({ user }) })
    }) as unknown as ExecutionContext

  it('allows a user with the required permission', () => {
    expect(guard.canActivate(contextFor(Routes, 'read', reader))).toBe(true)
  })

  it('refuses a route without @CheckAbility (fails closed)', () => {
    expect(() => guard.canActivate(contextFor(Routes, 'undecorated', reader))).toThrow(
      ForbiddenException
    )
  })

  it('honours a class-level @CheckAbility', () => {
    expect(() => guard.canActivate(contextFor(ClassLevel, 'list', reader))).toThrow(
      ForbiddenException
    )
  })

  it('needs a user', () => {
    expect(() => guard.canActivate(contextFor(Routes, 'read'))).toThrow(UnauthorizedException)
  })
})
