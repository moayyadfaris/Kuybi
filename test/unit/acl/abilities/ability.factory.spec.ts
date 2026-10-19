import { subject } from '@casl/ability'

import { AbilityFactory, asSubject } from '@modules/acl/abilities/ability.factory'
import { Permission } from '@modules/acl/entities/permission.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { User } from '@modules/users/entities/user.entity'

const permission = (
  action: Action,
  subj: Subject,
  conditions: Record<string, unknown> = {},
  inverted = false
): RolePermission =>
  ({
    permission: { action, subject: subj, conditions, inverted } as Permission
  }) as RolePermission

const role = (id: number, name: string, perms: RolePermission[], isActive = true): Role =>
  ({ id, name, isActive, rolePermissions: perms }) as Role

const userWith = (primaryRole: Role, userRoles: Partial<UserRole>[] = []): User => {
  const user = new User()
  user.id = 'user-1'
  user.primaryRole = primaryRole
  user.userRoles = userRoles as UserRole[]
  return user
}

describe('AbilityFactory', () => {
  const factory = new AbilityFactory()

  it('grants permissions of the primary role without any user_roles rows', () => {
    const moderator = role(3, 'moderator', [permission(Action.Create, Subject.Content)])
    const ability = factory.createForUser(userWith(moderator))

    expect(ability.can(Action.Create, Subject.Content)).toBe(true)
    expect(ability.can(Action.Delete, Subject.PostType)).toBe(false)
  })

  it('ignores an inactive primary role', () => {
    const disabled = role(3, 'moderator', [permission(Action.Create, Subject.Content)], false)
    const ability = factory.createForUser(userWith(disabled))

    expect(ability.can(Action.Create, Subject.Content)).toBe(false)
  })

  it('adds permissions from active additional roles and skips expired ones', () => {
    const base = role(4, 'user', [])
    const editor = role(6, 'content-editor', [permission(Action.Publish, Subject.Content)])
    const auditor = role(7, 'auditor', [permission(Action.Read, Subject.AuditLog)])

    const ability = factory.createForUser(
      userWith(base, [
        { isActive: true, role: editor },
        { isActive: true, role: auditor, expiresAt: new Date(Date.now() - 1000) }
      ])
    )

    expect(ability.can(Action.Publish, Subject.Content)).toBe(true)
    expect(ability.can(Action.Read, Subject.AuditLog)).toBe(false)
  })

  it('interpolates ${userId} conditions for ownership rules', () => {
    const userRole = role(4, 'user', [
      permission(Action.Update, Subject.Story, { userId: '${userId}' })
    ])
    const ability = factory.createForUser(userWith(userRole))

    expect(ability.can(Action.Update, subject(Subject.Story, { userId: 'user-1' }) as never)).toBe(
      true
    )
    expect(
      ability.can(Action.Update, subject(Subject.Story, { userId: 'someone-else' }) as never)
    ).toBe(false)
  })

  describe('per-record checks with asSubject', () => {
    const ownStories = role(4, 'user', [
      permission(Action.Update, Subject.Story, { userId: '${userId}' })
    ])

    it('applies conditional rules to plain objects (records served from the cache)', () => {
      const ability = factory.createForUser(userWith(ownStories))
      // A cache hit is JSON, not a Story instance
      const cached = JSON.parse(JSON.stringify({ id: 9, userId: 'user-1' }))

      expect(ability.can(Action.Update, asSubject(Subject.Story, cached))).toBe(true)
      expect(ability.can(Action.Update, asSubject(Subject.Story, { userId: 'other' }))).toBe(false)
    })

    it('does not modify the record it tags', () => {
      const record = { id: 9, userId: 'user-1' }

      asSubject(Subject.Story, record)

      expect(Object.keys(record)).toEqual(['id', 'userId'])
    })

    it('honours inverted (cannot) permissions', () => {
      const ability = factory.createForUser(
        userWith(
          role(4, 'user', [
            permission(Action.Read, Subject.Story),
            permission(Action.Read, Subject.Story, { status: 'DRAFT' }, true)
          ])
        )
      )

      expect(ability.can(Action.Read, asSubject(Subject.Story, { status: 'PUBLISHED' }))).toBe(true)
      expect(ability.can(Action.Read, asSubject(Subject.Story, { status: 'DRAFT' }))).toBe(false)
    })
  })
})
