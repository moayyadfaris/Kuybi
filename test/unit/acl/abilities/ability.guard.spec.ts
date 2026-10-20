import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { CheckAbility } from '@modules/acl/abilities/ability.decorator'
import { AbilityFactory } from '@modules/acl/abilities/ability.factory'
import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { Permission } from '@modules/acl/entities/permission.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { AccessDeniedEvent } from '@modules/acl/events/access-denied.event'
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
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) }
  const guard = new AbilityGuard(new Reflector(), new AbilityFactory(), eventBus)
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
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          method: 'GET',
          originalUrl: '/api/v1/tags?token=t',
          headers: {},
          get: () => undefined
        })
      })
    }) as unknown as ExecutionContext

  beforeEach(() => eventBus.publish.mockClear())

  it('allows a user with the required permission', async () => {
    await expect(guard.canActivate(contextFor(Routes, 'read', reader))).resolves.toBe(true)
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('refuses a route without @CheckAbility (fails closed)', async () => {
    await expect(guard.canActivate(contextFor(Routes, 'undecorated', reader))).rejects.toThrow(
      ForbiddenException
    )
  })

  it('honours a class-level @CheckAbility and publishes the refusal', async () => {
    await expect(guard.canActivate(contextFor(ClassLevel, 'list', reader))).rejects.toThrow(
      ForbiddenException
    )
    const [event] = eventBus.publish.mock.calls[0] as [AccessDeniedEvent]
    expect(event).toBeInstanceOf(AccessDeniedEvent)
    expect(event).toMatchObject({
      actor: { id: 'u1' },
      required: `${Action.Read} ${Subject.Tag}`,
      request: { method: 'GET', endpoint: '/api/v1/tags' }
    })
  })

  it('needs a user', async () => {
    await expect(guard.canActivate(contextFor(Routes, 'read'))).rejects.toThrow(
      UnauthorizedException
    )
  })
})
