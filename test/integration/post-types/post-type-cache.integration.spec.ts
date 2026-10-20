/**
 * Post type reads served from the cache follow writes at once: updates and soft deletes
 * (list and slug lookup), and changes to its fields, which the post type embeds when read
 * by slug.
 */
import { PostTypesModule } from '@modules/post-types/post-types.module'

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

describe('Post type caches', () => {
  let t: HttpTestApp
  let admin: Actor
  let postType: { id: string; slug: string }

  const bySlug = async () =>
    (await t.http().get(`/api/v1/post-types/slug/${postType.slug}`).expect(200)).body.data
  const fieldNames = async () =>
    ((await bySlug()).fieldDefinitions as Array<{ name: string; deletedAt?: string }>)
      .filter(f => !f.deletedAt)
      .map(f => f.name)
      .sort()
  const activeNames = async () =>
    (await t.http().get('/api/v1/post-types').expect(200)).body.data.map(
      (p: { name: string }) => p.name
    )

  beforeAll(async () => {
    t = await createHttpTestApp([PostTypesModule], { resetTables: TABLES })
    admin = await t.signUp('admin@post-type-cache.test', 'super-admin')
  })

  beforeEach(async () => {
    await t.dataSource.query('DELETE FROM field_definitions; DELETE FROM post_types')
    await t.cache.reset()
    postType = (
      await t
        .http()
        .post('/api/v1/post-types')
        .set(admin.auth)
        .send({ name: 'Event', singularLabel: 'Event', pluralLabel: 'Events' })
        .expect(201)
    ).body.data
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('shows added and removed fields on the post type at once', async () => {
    expect(await fieldNames()).toEqual([]) // now cached

    const field = (
      await t
        .http()
        .post(`/api/v1/post-types/${postType.id}/fields`)
        .set(admin.auth)
        .send({ name: 'venue', label: 'Venue', fieldType: 'text' })
        .expect(201)
    ).body.data
    expect(await fieldNames()).toEqual(['venue'])

    await t
      .http()
      .patch(`/api/v1/post-types/${postType.id}/fields/${field.id}`)
      .set(admin.auth)
      .send({ label: 'Location' })
      .expect(200)
    const [updated] = (await bySlug()).fieldDefinitions
    expect(updated.label).toBe('Location')

    await t
      .http()
      .delete(`/api/v1/post-types/${postType.id}/fields/${field.id}`)
      .set(admin.auth)
      .expect(204)
    expect(await fieldNames()).toEqual([])
  })

  it('serves an update and a soft delete at once, in the list and by slug', async () => {
    expect(await activeNames()).toContain('Event') // now cached
    await bySlug()

    await t
      .http()
      .patch(`/api/v1/post-types/${postType.id}`)
      .set(admin.auth)
      .send({ pluralLabel: 'Happenings' })
      .expect(200)
    expect((await bySlug()).pluralLabel).toBe('Happenings')

    await t.http().delete(`/api/v1/post-types/${postType.id}`).set(admin.auth).expect(204)
    expect(await activeNames()).not.toContain('Event')
    await t.http().get(`/api/v1/post-types/slug/${postType.slug}`).expect(404)
  })
})
