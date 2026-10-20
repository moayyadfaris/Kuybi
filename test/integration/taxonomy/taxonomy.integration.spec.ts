/**
 * Categories and tags over HTTP: admin CRUD, read-only for regular users, soft delete
 * and restore, cache coherence after writes, and the public web categories.
 */
import { CategoriesModule } from '@modules/categories/categories.module'
import { Category } from '@modules/categories/entities/category.entity'
import { Story } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'
import { WebModule } from '@modules/web/web.module'

import { StoryFactory } from '../../factories/story.factory'
import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'story_categories',
  'story_tags',
  'story_versions',
  'stories',
  'categories',
  'tags',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Taxonomy (categories and tags)', () => {
  let t: HttpTestApp
  let admin: Actor
  let member: Actor

  beforeAll(async () => {
    t = await createHttpTestApp([CategoriesModule, TagsModule, StoriesModule, WebModule], {
      resetTables: TABLES
    })
    admin = await t.signUp('admin@taxonomy.test', 'admin')
    member = await t.signUp('member@taxonomy.test', 'user')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM story_categories; DELETE FROM story_tags; DELETE FROM story_versions; DELETE FROM stories; DELETE FROM categories; DELETE FROM tags'
    )
    await t.cache.reset()
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  const createCategory = (name: string, extra: object = {}) =>
    t
      .http()
      .post('/api/v1/categories')
      .set(admin.auth)
      .send({ name, ...extra })

  describe('categories', () => {
    it('lets an admin create one and derives the slug', async () => {
      const res = await createCategory('Local News').expect(201)

      expect(res.body.data).toMatchObject({
        name: 'Local News',
        slug: 'local-news',
        isActive: true
      })
    })

    it('suffixes a generated slug on collision and rejects a taken explicit slug', async () => {
      await createCategory('Sports').expect(201)

      const second = await createCategory('Sports').expect(201)
      expect(second.body.data.slug).toMatch(/^sports-\d+$/)

      const res = await createCategory('Other', { slug: 'sports' }).expect(409)
      expect(res.body.error.message).toContain('sports')
    })

    it('lets regular users read but not write', async () => {
      const created = (await createCategory('Culture').expect(201)).body.data

      await t.http().get('/api/v1/categories').set(member.auth).expect(200)
      await t.http().get(`/api/v1/categories/${created.id}`).set(member.auth).expect(200)
      await t.http().post('/api/v1/categories').set(member.auth).send({ name: 'Nope' }).expect(403)
      await t
        .http()
        .patch(`/api/v1/categories/${created.id}`)
        .set(member.auth)
        .send({ name: 'Nope' })
        .expect(403)
      await t.http().delete(`/api/v1/categories/${created.id}`).set(member.auth).expect(403)
    })

    it('serves the update, not the cached copy (a new slug moves it)', async () => {
      const created = (await createCategory('Economy').expect(201)).body.data
      await t.http().get(`/api/v1/categories/${created.id}`).set(admin.auth).expect(200) // cache
      await t.http().get(`/api/v1/categories/slug/${created.slug}`).set(admin.auth).expect(200)

      const updated = await t
        .http()
        .patch(`/api/v1/categories/${created.id}`)
        .set(admin.auth)
        .send({ name: 'Markets', slug: 'markets' })
        .expect(200)
      expect(updated.body.data.slug).toBe('markets')

      const byId = await t.http().get(`/api/v1/categories/${created.id}`).set(admin.auth)
      expect(byId.body.data.name).toBe('Markets')
      const bySlug = await t.http().get('/api/v1/categories/slug/markets').set(admin.auth)
      expect(bySlug.body.data.name).toBe('Markets')
      await t.http().get(`/api/v1/categories/slug/${created.slug}`).set(admin.auth).expect(404)
    })

    it('soft-deletes and restores', async () => {
      const created = (await createCategory('Weather').expect(201)).body.data

      await t.http().delete(`/api/v1/categories/${created.id}`).set(admin.auth).expect(204)
      await t.http().get(`/api/v1/categories/${created.id}`).set(admin.auth).expect(404)
      const active = await t.http().get('/api/v1/categories/active').set(admin.auth).expect(200)
      expect(JSON.stringify(active.body.data)).not.toContain(created.id)

      // No role is granted Restore Category: super-admin only
      await t.http().post(`/api/v1/categories/${created.id}/restore`).set(admin.auth).expect(403)
      const root = await t.signUp(`restore-${Date.now()}@taxonomy.test`, 'super-admin')
      await t.http().post(`/api/v1/categories/${created.id}/restore`).set(root.auth).expect(201)
      await t.http().get(`/api/v1/categories/${created.id}`).set(admin.auth).expect(200)
    })

    it('hard-deletes a category that stories use, removing their links', async () => {
      const created = (await createCategory('Archive').expect(201)).body.data
      const story = await t.dataSource
        .getRepository(Story)
        .save(StoryFactory.create({ userId: admin.user.id, createdBy: admin.user.id }) as Story)
      await t.dataSource.query(
        'INSERT INTO story_categories ("storyId", "categoryId") VALUES ($1, $2)',
        [story.id, created.id]
      )

      // Only super-admin (Manage All) may hard-delete
      await t.http().delete(`/api/v1/categories/${created.id}/hard`).set(admin.auth).expect(403)
      const root = await t.signUp(`root-${Date.now()}@taxonomy.test`, 'super-admin')
      await t.http().delete(`/api/v1/categories/${created.id}/hard`).set(root.auth).expect(204)

      expect(await t.dataSource.getRepository(Category).findOneBy({ id: created.id })).toBeNull()
      const links = await t.dataSource.query(
        'SELECT 1 FROM story_categories WHERE "categoryId" = $1',
        [created.id]
      )
      expect(links).toHaveLength(0)
    })

    it('reports stats', async () => {
      await createCategory('Alpha').expect(201)
      await createCategory('Beta', { isActive: false }).expect(201)

      const res = await t.http().get('/api/v1/categories/stats').set(admin.auth).expect(200)
      expect(res.body.data).toBeDefined()
    })
  })

  describe('public web categories', () => {
    it('lists active categories without authentication', async () => {
      await createCategory('Visible').expect(201)
      await createCategory('Hidden', { isActive: false }).expect(201)

      const res = await t.http().get('/api/web/v1/categories').expect(200)
      const names = JSON.stringify(res.body.data)
      expect(names).toContain('Visible')
      expect(names).not.toContain('Hidden')

      await t.http().get('/api/web/v1/categories/slug/visible').expect(200)
      await t.http().get('/api/web/v1/categories/tree').expect(200)
    })
  })

  describe('tags', () => {
    const createTag = (name: string, extra: object = {}) =>
      t
        .http()
        .post('/api/v1/tags')
        .set(admin.auth)
        .send({ name, ...extra })

    it('lets an admin create, update and delete tags', async () => {
      const created = (await createTag('elections', { color: '#FF5733' }).expect(201)).body.data
      expect(created).toMatchObject({ name: 'elections', color: '#FF5733' })

      await t
        .http()
        .patch(`/api/v1/tags/${created.id}`)
        .set(admin.auth)
        .send({ color: '#000000' })
        .expect(200)
      const read = await t.http().get(`/api/v1/tags/${created.id}`).set(member.auth).expect(200)
      expect(read.body.data.color).toBe('#000000')

      await t.http().delete(`/api/v1/tags/${created.id}`).set(admin.auth).expect(204)
      await t.http().get(`/api/v1/tags/${created.id}`).set(member.auth).expect(404)
    })

    it('validates input and blocks regular users from writing', async () => {
      await createTag('x').expect(400) // too short
      await createTag('valid-tag', { color: 'red' }).expect(400)
      await t.http().post('/api/v1/tags').set(member.auth).send({ name: 'mine' }).expect(403)
    })

    it('lists tags and system tags', async () => {
      await createTag('regular').expect(201)
      // System tags are created by super-admins
      const root = await t.signUp(`tags-${Date.now()}@taxonomy.test`, 'super-admin')
      await t
        .http()
        .post('/api/v1/tags')
        .set(root.auth)
        .send({ name: 'pinned', isSystem: true })
        .expect(201)

      const all = await t.http().get('/api/v1/tags').set(member.auth).expect(200)
      expect(JSON.stringify(all.body.data)).toContain('regular')
      const system = await t.http().get('/api/v1/tags/system').set(member.auth).expect(200)
      const systemNames = JSON.stringify(system.body.data)
      expect(systemNames).toContain('pinned')
      expect(systemNames).not.toContain('regular')
    })
  })
})
