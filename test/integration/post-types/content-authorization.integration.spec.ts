/**
 * Content permissions per entry. A role may be granted content rights with conditions
 * (e.g. a contributor may create and update only entries they author): the condition must
 * hold for the entry acted on, and drafts are visible only to those who may edit them.
 * Before, any Update on content (even conditional) made the user an editor of every
 * entry: they saw others' drafts and could change them.
 */
import { Permission } from '@modules/acl/entities/permission.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { PostContent } from '@modules/post-types/entities/post-content.entity'
import { PostType } from '@modules/post-types/entities/post-type.entity'
import { PostTypesModule } from '@modules/post-types/post-types.module'
import { User } from '@modules/users/entities/user.entity'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'post_content',
  'field_definitions',
  'post_types',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Content authorization per entry', () => {
  let t: HttpTestApp
  let admin: Actor
  let contributor: Actor
  let othersDraft: string
  let ownDraft: string

  const api = '/api/v1/content/news'

  /** A role granted only conditional content rights: its own entries */
  const contributorRole = async () => {
    const role = await t.dataSource
      .getRepository(Role)
      .save({ name: 'contributor', description: 'Own content only', priority: 30, isActive: true })
    const permissions = await t.dataSource.getRepository(Permission).save(
      [Action.Create, Action.Update].map(action => ({
        action,
        subject: Subject.Content,
        conditions: { authorId: '${userId}' },
        reason: `${action} own content`
      })) as unknown as Permission[]
    )
    await t.dataSource
      .getRepository(RolePermission)
      .save(permissions.map(permission => ({ roleId: role.id, permissionId: permission.id })))
    return role
  }

  beforeAll(async () => {
    t = await createHttpTestApp([PostTypesModule], { resetTables: TABLES })
    admin = await t.signUp('admin@content-authorization.test', 'admin')
    contributor = await t.signUp('contributor@content-authorization.test', 'user')
    const role = await contributorRole()
    await t.dataSource.getRepository(User).update(contributor.user.id, { primaryRoleId: role.id })
    await t.dataSource.getRepository(PostType).save({
      name: 'News',
      slug: 'news',
      singularLabel: 'News',
      pluralLabel: 'News',
      isActive: true
    } as PostType)

    othersDraft = (
      await t.http().post(api).set(admin.auth).send({ title: 'Admin draft', field_data: {} })
    ).body.data.id
    ownDraft = (
      await t
        .http()
        .post(api)
        .set(contributor.auth)
        .send({ title: 'My draft', field_data: {} })
        .expect(201)
    ).body.data.id
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it("lists the contributor's own drafts but not others'", async () => {
    const res = await t.http().get(api).set(contributor.auth).expect(200)
    const ids = res.body.data.data.map((entry: PostContent) => entry.id)
    expect(ids).toContain(ownDraft)
    expect(ids).not.toContain(othersDraft)
  })

  it("hides another author's draft (404) and refuses to change it", async () => {
    await t.http().get(`${api}/${othersDraft}`).set(contributor.auth).expect(404)
    await t
      .http()
      .patch(`${api}/${othersDraft}`)
      .set(contributor.auth)
      .send({ title: 'Taken over' })
      .expect(404)
    const stored = await t.dataSource
      .getRepository(PostContent)
      .findOneByOrFail({ id: othersDraft })
    expect(stored.title).toBe('Admin draft')
  })

  it('lets the contributor edit their own entry', async () => {
    await t.http().get(`${api}/${ownDraft}`).set(contributor.auth).expect(200)
    await t
      .http()
      .patch(`${api}/${ownDraft}`)
      .set(contributor.auth)
      .send({ title: 'My draft, edited' })
      .expect(200)
  })

  it('still gives an unconditional editor every entry', async () => {
    const res = await t.http().get(api).set(admin.auth).expect(200)
    const ids = res.body.data.data.map((entry: PostContent) => entry.id)
    expect(ids).toEqual(expect.arrayContaining([ownDraft, othersDraft]))
  })
})
