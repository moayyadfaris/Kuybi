/**
 * Role administration and its effect on what users may do: a deleted role stops granting
 * its permissions at once, and role and permission changes are audited.
 */
import { Permission } from '@modules/acl/entities/permission.entity'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { AuditModule } from '@modules/audit/audit.module'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'
import { TagsModule } from '@modules/tags/tags.module'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'audit_logs',
  'tags',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Role lifecycle', () => {
  let t: HttpTestApp
  let root: Actor
  let member: Actor
  let createTag: Permission

  const createTagAs = (as: Actor, name: string) =>
    t.http().post('/api/v1/tags').set(as.auth).send({ name })

  beforeAll(async () => {
    t = await createHttpTestApp([AuditModule, TagsModule], { resetTables: TABLES })
    root = await t.signUp('root@role-lifecycle.test', 'super-admin')
    member = await t.signUp('member@role-lifecycle.test', 'user')
    createTag = await t.dataSource
      .getRepository(Permission)
      .findOneByOrFail({ action: Action.Create, subject: Subject.Tag })
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('stops granting the permissions of a deleted role', async () => {
    const role = (
      await t
        .http()
        .post('/api/v1/roles')
        .set(root.auth)
        .send({ name: 'tag-editor', description: 'Tags', priority: 30 })
        .expect(201)
    ).body.data
    await t
      .http()
      .post(`/api/v1/roles/${role.id}/permissions`)
      .set(root.auth)
      .send({ permissionIds: [createTag.id] })
      .expect(201)
    await t
      .http()
      .post(`/api/v1/users/${member.user.id}/roles`)
      .set(root.auth)
      .send({ roleId: role.id })
      .expect(201)
    await createTagAs(member, 'allowed').expect(201)

    await t.http().delete(`/api/v1/roles/${role.id}`).set(root.auth).expect(204)

    await createTagAs(member, 'refused').expect(403)
  })

  it('audits role changes', async () => {
    const role = (
      await t
        .http()
        .post('/api/v1/roles')
        .set(root.auth)
        .send({ name: 'audited-role', description: 'x', priority: 20 })
        .expect(201)
    ).body.data
    await t
      .http()
      .post(`/api/v1/roles/${role.id}/permissions`)
      .set(root.auth)
      .send({ permissionIds: [createTag.id] })
      .expect(201)
    await t.http().delete(`/api/v1/roles/${role.id}`).set(root.auth).expect(204)

    const actions = (
      await t.dataSource.getRepository(AuditLog).find({
        where: { entityType: 'Role', entityId: String(role.id) },
        order: { createdAt: 'ASC' }
      })
    ).map(log => log.action)
    expect(actions).toEqual(['create', 'permission_grant', 'delete'])
  })

  it('refuses field-level permissions, which are not enforced', async () => {
    const permission = (body: object) =>
      t
        .http()
        .post('/api/v1/permissions')
        .set(root.auth)
        .send({
          action: Action.Update,
          subject: Subject.Story,
          // A combination not seeded, so the plain one can be created
          conditions: { status: 'pending_review' },
          reason: 'Edit titles only',
          ...body
        })

    await permission({ fields: ['title'] }).expect(400)
    const plain = await permission({}).expect(201)
    await t
      .http()
      .put(`/api/v1/permissions/${plain.body.data.id}`)
      .set(root.auth)
      .send({ fields: ['title'] })
      .expect(400)
  })
})
