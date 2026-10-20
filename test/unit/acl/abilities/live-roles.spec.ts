/**
 * Which roles count: the primary role while active and not deleted, and additional roles
 * while both the assignment (active, unexpired) and the role are live. Every role check
 * - the super-admin bypass, hasRole, hierarchy ranking, the ability - must agree.
 */
import { AbilityFactory } from '@modules/acl/abilities/ability.factory'
import { Role } from '@modules/acl/entities/role.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { User } from '@modules/users/entities/user.entity'

const role = (name: string, priority: number, extra: Partial<Role> = {}) =>
  ({ id: priority, name, priority, isActive: true, rolePermissions: [], ...extra }) as Role
const userWith = (primary: Role | null, assignments: Partial<UserRole>[] = []) =>
  Object.assign(new User(), {
    id: 'u1',
    primaryRole: primary,
    userRoles: assignments.map(a => ({ isActive: true, expiresAt: null, ...a }) as UserRole)
  })

describe('live roles', () => {
  const factory = new AbilityFactory()
  const canManageAll = (user: User) => factory.createForUser(user).can(Action.Manage, Subject.All)

  it.each([
    ['an inactive primary role', userWith(role('super-admin', 100, { isActive: false }))],
    ['a deleted primary role', userWith(role('super-admin', 100, { deletedAt: new Date() }))],
    [
      'an inactive additional role',
      userWith(role('user', 40), [{ role: role('super-admin', 100, { isActive: false }) }])
    ],
    [
      'a deleted additional role',
      userWith(role('user', 40), [{ role: role('super-admin', 100, { deletedAt: new Date() }) }])
    ],
    [
      'a revoked assignment',
      userWith(role('user', 40), [{ role: role('super-admin', 100), isActive: false }])
    ],
    [
      'an assignment expired (date read back from the cache as a string)',
      userWith(role('user', 40), [
        { role: role('super-admin', 100), expiresAt: '2020-01-01T00:00:00Z' as unknown as Date }
      ])
    ]
  ])('gives no super-admin power through %s', (_case, user) => {
    expect(user.isSuperAdmin()).toBe(false)
    expect(user.hasRole('super-admin')).toBe(false)
    expect(canManageAll(user)).toBe(false)
  })

  it('still honours a live super-admin role, primary or additional', () => {
    expect(canManageAll(userWith(role('super-admin', 100)))).toBe(true)
    expect(userWith(role('user', 40), [{ role: role('super-admin', 100) }]).isSuperAdmin()).toBe(
      true
    )
  })

  it('ranks by live roles only', () => {
    const user = userWith(role('admin', 80, { isActive: false }), [
      { role: role('moderator', 60) },
      { role: role('owner', 95, { deletedAt: new Date() }) }
    ])
    expect(user.getHighestPriorityRole()?.name).toBe('moderator')
    expect(userWith(role('admin', 80, { isActive: false })).getHighestPriorityRole()).toBeNull()
  })
})
