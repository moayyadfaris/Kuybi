/**
 * Category edge cases: slugs of deleted categories are free again (409, not 500, on a
 * clash), soft delete and restore keep the active flag, renaming keeps the slug,
 * who changed what is recorded, search matches literally, malformed ids answer 400,
 * deleted categories are listed only to those who may restore them and disappear from
 * stories.
 */
import { CategoriesModule } from '@modules/categories/categories.module'
import { Category } from '@modules/categories/entities/category.entity'
import { Story } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'

import { StoryFactory } from '../../factories/story.factory'
import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'story_categories',
  'story_versions',
  'stories',
  'categories',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Category hardening', () => {
  let t: HttpTestApp
  let admin: Actor
  let root: Actor

  const api = '/api/v1/categories'
  const create = (body: object) => t.http().post(api).set(admin.auth).send(body)
  const remove = (id: string) => t.http().delete(`${api}/${id}`).set(admin.auth)
  const restore = (id: string) => t.http().post(`${api}/${id}/restore`).set(root.auth)
  const stored = (id: string) => t.dataSource.getRepository(Category).findOneByOrFail({ id })

  beforeAll(async () => {
    t = await createHttpTestApp([CategoriesModule, StoriesModule], { resetTables: TABLES })
    admin = await t.signUp('admin@category-hardening.test', 'admin')
    root = await t.signUp('root@category-hardening.test', 'super-admin')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM story_categories; DELETE FROM story_versions; DELETE FROM stories; DELETE FROM categories'
    )
    await t.cache.reset()
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it("frees a deleted category's slug, and refuses to restore over a live one", async () => {
    const first = (await create({ name: 'Sports', slug: 'sports' }).expect(201)).body.data
    await remove(first.id).expect(204)

    const second = await create({ name: 'Sports', slug: 'sports' }).expect(201)
    expect(second.body.data.slug).toBe('sports')
    const generated = await create({ name: 'Weather' }).expect(201)
    await remove(generated.body.data.id).expect(204)
    expect((await create({ name: 'Weather' }).expect(201)).body.data.slug).toBe('weather')

    await restore(first.id).expect(409)
  })

  it('keeps the active flag through delete and restore; restores only deleted ones', async () => {
    const hidden = (await create({ name: 'Hidden', isActive: false }).expect(201)).body.data
    await restore(hidden.id).expect(404)
    expect((await stored(hidden.id)).isActive).toBe(false)

    await remove(hidden.id).expect(204)
    const restored = await restore(hidden.id).expect(201)
    expect(restored.body.data.isActive).toBe(false)
  })

  it('keeps the slug when renaming unless a new one is sent', async () => {
    const created = (await create({ name: 'Economy' }).expect(201)).body.data
    const renamed = await t
      .http()
      .patch(`${api}/${created.id}`)
      .set(admin.auth)
      .send({ name: 'Markets' })
      .expect(200)
    expect(renamed.body.data).toMatchObject({ name: 'Markets', slug: 'economy' })
  })

  it('records who created, changed and deleted a category', async () => {
    const created = (await create({ name: 'Audit' }).expect(201)).body.data
    expect((await stored(created.id)).createdBy).toBe(admin.user.id)

    await t.http().patch(`${api}/${created.id}`).set(root.auth).send({ name: 'Audited' })
    expect((await stored(created.id)).updatedBy).toBe(root.user.id)

    await remove(created.id).expect(204)
    expect((await stored(created.id)).deletedBy).toBe(admin.user.id)
  })

  it('matches % and _ in a search literally, with or without counts', async () => {
    await create({ name: 'A_B' }).expect(201)
    await create({ name: 'AxB' }).expect(201)

    for (const includeCounts of [false, true]) {
      const res = await t
        .http()
        .get(api)
        .query({ search: 'A_B', includeCounts })
        .set(admin.auth)
        .expect(200)
      expect(res.body.data.results.map((c: Category) => c.name)).toEqual(['A_B'])
      expect(res.body.data.total).toBe(1)
    }
  })

  it('answers 400 for a malformed id', async () => {
    await t.http().get(`${api}/not-a-uuid`).set(admin.auth).expect(400)
    await t.http().patch(`${api}/not-a-uuid`).set(admin.auth).send({ name: 'X' }).expect(400)
    await remove('not-a-uuid').expect(400)
    await restore('not-a-uuid').expect(400)
    await t.http().delete(`${api}/not-a-uuid/hard`).set(root.auth).expect(400)
  })

  it('lists deleted categories only to those who may restore them', async () => {
    const gone = (await create({ name: 'Gone' }).expect(201)).body.data
    await remove(gone.id).expect(204)

    const asAdmin = await t
      .http()
      .get(api)
      .query({ includeDeleted: true })
      .set(admin.auth)
      .expect(200)
    expect(asAdmin.body.data.total).toBe(0)

    const asRoot = await t.http().get(api).query({ includeDeleted: true }).set(root.auth)
    expect(asRoot.body.data.results.map((c: Category) => c.id)).toEqual([gone.id])
  })

  it('drops deleted categories from stories', async () => {
    const kept = (await create({ name: 'Kept' }).expect(201)).body.data
    const gone = (await create({ name: 'Gone' }).expect(201)).body.data
    const story = await t.dataSource
      .getRepository(Story)
      .save(StoryFactory.create({ userId: admin.user.id, createdBy: admin.user.id }) as Story)
    await t.dataSource.query(
      'INSERT INTO story_categories ("storyId", "categoryId") VALUES ($1, $2), ($1, $3)',
      [story.id, kept.id, gone.id]
    )
    await remove(gone.id).expect(204)

    const res = await t.http().get(`/api/v1/stories/${story.id}`).set(admin.auth).expect(200)
    expect(res.body.data.categories.map((c: Category) => c.id)).toEqual([kept.id])
  })
})
