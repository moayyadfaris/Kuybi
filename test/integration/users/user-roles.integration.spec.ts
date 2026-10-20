/**
 * Role assignments over HTTP: who may read them, and that changes are single, audited and
 * reflected at once.
 */
import { Role } from '@modules/acl/entities/role.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { AuditModule } from '@modules/audit/audit.module'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'audit_logs',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('User role assignments', () => {
  let t: HttpTestApp
  let member: Actor
  let other: Actor
  let root: Actor
  let moderator: Role

  const roles = (as: Actor, userId: string) =>
    t.http().get(`/api/v1/users/${userId}/roles`).set(as.auth)

  beforeAll(async () => {
    t = await createHttpTestApp([AuditModule], { resetTables: TABLES })
    member = await t.signUp('member@user-roles.test', 'user')
    other = await t.signUp('other@user-roles.test', 'user')
    root = await t.signUp('root@user-roles.test', 'super-admin')
    moderator = await t.dataSource.getRepository(Role).findOneByOrFail({ name: 'moderator' })
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('keeps role assignments from other users (regular users read their role on /users/me)', async () => {
    await roles(member, other.user.id).expect(403)
    await roles(root, other.user.id).expect(200)
  })

  it('assigns a role once, shows it at once, and audits every change', async () => {
    const url = `/api/v1/users/${other.user.id}/roles`
    expect((await roles(root, other.user.id)).body.data.roles).toEqual([]) // cached now

    const [first, second] = await Promise.all([
      t.http().post(url).set(root.auth).send({ roleId: moderator.id }),
      t.http().post(url).set(root.auth).send({ roleId: moderator.id })
    ])
    expect([first.status, second.status].sort()).toEqual([201, 409])
    expect(await t.dataSource.getRepository(UserRole).countBy({ userId: other.user.id })).toBe(1)

    const listed = (await roles(root, other.user.id)).body.data.roles
    expect(listed.map((r: { name: string }) => r.name)).toEqual(['moderator'])

    await t.http().post(`${url}/${moderator.id}/deactivate`).set(root.auth).expect(201)
    await t.http().post(`${url}/${moderator.id}/activate`).set(root.auth).expect(201)

    const actions = (
      await t.dataSource
        .getRepository(AuditLog)
        .find({ where: { entityType: 'UserRole' }, order: { createdAt: 'ASC' } })
    ).map(log => log.action)
    // assigned, deactivated, activated
    expect(actions).toEqual(['role_assign', 'role_revoke', 'role_assign'])
  })
})
