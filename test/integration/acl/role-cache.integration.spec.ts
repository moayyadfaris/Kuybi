/**
 * Role reads served from the cache reflect role writes right away: granting and removing
 * permissions (raw inserts into role_permissions) and deleting a role.
 */
import { Permission } from '@modules/acl/entities/permission.entity'
import { Role } from '@modules/acl/entities/role.entity'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = ['sessions', 'user_roles', 'role_permissions', 'users', 'roles', 'permissions']

describe('Role caches', () => {
  let t: HttpTestApp
  let root: Actor
  let role: Role
  let permission: Permission

  const permissionIds = async () =>
    (
      await t.http().get(`/api/v1/roles/${role.id}/permissions`).set(root.auth).expect(200)
    ).body.data.map((p: Permission) => p.id)

  beforeAll(async () => {
    t = await createHttpTestApp([], { resetTables: TABLES })
    root = await t.signUp('root@role-cache.test', 'super-admin')
    role = await t.dataSource
      .getRepository(Role)
      .save({ name: 'editor', description: 'Editor', priority: 60, isActive: true })
    permission = await t.dataSource.getRepository(Permission).findOneByOrFail({ id: 1 })
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('shows granted and removed permissions at once, not after the cache expires', async () => {
    expect(await permissionIds()).toEqual([]) // now cached

    await t
      .http()
      .post(`/api/v1/roles/${role.id}/permissions`)
      .set(root.auth)
      .send({ permissionIds: [permission.id] })
      .expect(201)
    expect(await permissionIds()).toEqual([permission.id])

    await t
      .http()
      .delete(`/api/v1/roles/${role.id}/permissions`)
      .set(root.auth)
      .send({ permissionIds: [permission.id] })
      .expect(200)
    expect(await permissionIds()).toEqual([])
  })

  it('drops a deleted role from the active list at once', async () => {
    const active = async () =>
      (await t.http().get('/api/v1/roles/active').set(root.auth).expect(200)).body.data.map(
        (r: Role) => r.name
      )
    expect(await active()).toContain('editor') // now cached

    await t.http().delete(`/api/v1/roles/${role.id}`).set(root.auth).expect(204)

    expect(await active()).not.toContain('editor')
  })
})
