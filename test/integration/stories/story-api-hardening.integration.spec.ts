/**
 * Stories API edge cases: request values that used to reach Postgres unchecked (500s),
 * unbounded page sizes, LIKE wildcards in search, stories a reader may not see (404,
 * not 403), staff-only fields, parent cycles, soft-deleted stories and categories, and
 * the shape of the story returned after linking.
 */
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { CategoriesModule } from '@modules/categories/categories.module'
import { Category } from '@modules/categories/entities/category.entity'
import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'

import { StoryFactory } from '../../factories/story.factory'
import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'story_attachments',
  'story_tags',
  'story_categories',
  'story_versions',
  'stories',
  'attachments',
  'tags',
  'categories',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Stories API hardening', () => {
  let t: HttpTestApp
  let owner: Actor
  let other: Actor
  let admin: Actor

  const stories = () => t.dataSource.getRepository(Story)
  const save = (overrides: Partial<Story> = {}) =>
    stories().save(
      StoryFactory.create({
        userId: owner.user.id,
        createdBy: owner.user.id,
        ...overrides
      }) as Story
    )
  const category = (name: string, deletedAt: Date | null = null) =>
    t.dataSource.getRepository(Category).save({ name, slug: name, deletedAt } as Category)

  beforeAll(async () => {
    t = await createHttpTestApp([AttachmentsModule, TagsModule, CategoriesModule, StoriesModule], {
      resetTables: TABLES
    })
    owner = await t.signUp('owner@story-hardening.test', 'user')
    other = await t.signUp('other@story-hardening.test', 'user')
    admin = await t.signUp('admin@story-hardening.test', 'super-admin')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM story_attachments; DELETE FROM story_tags; DELETE FROM story_categories; ' +
        'DELETE FROM story_versions; DELETE FROM stories; DELETE FROM attachments; ' +
        'DELETE FROM tags; DELETE FROM categories'
    )
    await t.cache.reset()
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  describe('request validation', () => {
    it('rejects unknown statuses, types and user ids with 400', async () => {
      await t.http().get('/api/v1/stories/status/NOPE').set(admin.auth).expect(400)
      await t.http().get('/api/v1/stories/type/NOPE').set(admin.auth).expect(400)
      await t.http().get('/api/v1/stories/user/not-a-uuid').set(admin.auth).expect(400)

      const story = await save()
      await t
        .http()
        .patch(`/api/v1/stories/${story.id}/status`)
        .set(admin.auth)
        .send({ status: 'NOPE' })
        .expect(400)
      await t
        .http()
        .delete(`/api/v1/stories/${story.id}`)
        .query({ reason: 'x'.repeat(256) })
        .set(owner.auth)
        .expect(400)
      expect((await stories().findOneByOrFail({ id: story.id })).deletedAt).toBeNull()
    })

    it('caps page sizes at 100', async () => {
      await t.http().get('/api/v1/stories').query({ limit: 1000 }).set(owner.auth).expect(400)
      await t
        .http()
        .get(`/api/v1/stories/status/${StoryStatus.PUBLISHED}`)
        .query({ limit: 1000 })
        .set(owner.auth)
        .expect(400)
      await t
        .http()
        .get(`/api/v1/stories/user/${owner.user.id}`)
        .query({ limit: 0 })
        .set(owner.auth)
        .expect(400)
    })

    it('needs a tag name to tag a version', async () => {
      const story = await save()
      await t.http().post(`/api/v1/stories/${story.id}/versions`).set(owner.auth).expect(201)
      await t
        .http()
        .post(`/api/v1/stories/${story.id}/versions/1/tag`)
        .set(owner.auth)
        .send({})
        .expect(400)
    })
  })

  it('matches % and _ in a search literally', async () => {
    const percent = await save({ title: 'Rates up 100% this year', status: StoryStatus.PUBLISHED })
    await save({ title: 'Rates up 1000 points', status: StoryStatus.PUBLISHED })

    const res = await t
      .http()
      .get('/api/v1/stories')
      .query({ search: '100%' })
      .set(owner.auth)
      .expect(200)
    expect(res.body.data.results.map((s: Story) => s.id)).toEqual([percent.id])
  })

  it('keeps every category of a story found by category', async () => {
    const [news, sport] = await Promise.all([category('news'), category('sport')])
    const story = await save({ status: StoryStatus.PUBLISHED, categories: [news, sport] })

    const res = await t
      .http()
      .get('/api/v1/stories')
      .query({ categoryIds: news.id })
      .set(owner.auth)
      .expect(200)
    const [found] = res.body.data.results
    expect(found.id).toBe(story.id)
    expect(found.categories.map((c: Category) => c.slug).sort()).toEqual(['news', 'sport'])
  })

  describe("another user's story", () => {
    it('answers 404, not 403, for changes to a story the caller cannot see', async () => {
      const draft = await save()

      await t
        .http()
        .patch(`/api/v1/stories/${draft.id}`)
        .set(other.auth)
        .send({ title: 'Hijacked' })
        .expect(404)
      await t.http().delete(`/api/v1/stories/${draft.id}`).set(other.auth).expect(404)
      await t
        .http()
        .post(`/api/v1/stories/${draft.id}/tags`)
        .set(other.auth)
        .send({ tags: ['xray'] })
        .expect(404)
      await t.http().delete(`/api/v1/stories/${draft.id}/main-image`).set(other.auth).expect(404)
    })

    it('hides staff notes from readers who cannot edit the story', async () => {
      const story = await save({ status: StoryStatus.PUBLISHED, internalNotes: 'check sources' })

      const asOther = await t.http().get(`/api/v1/stories/${story.id}`).set(other.auth).expect(200)
      expect(asOther.body.data.internalNotes).toBeUndefined()
      const listed = await t.http().get('/api/v1/stories').set(other.auth).expect(200)
      expect(listed.body.data.results[0].internalNotes).toBeUndefined()

      const asOwner = await t.http().get(`/api/v1/stories/${story.id}`).set(owner.auth).expect(200)
      expect(asOwner.body.data.internalNotes).toBe('check sources')
    })

    it('keeps the version history to those who can edit the story', async () => {
      const story = await save({ status: StoryStatus.PUBLISHED })
      await t.http().post(`/api/v1/stories/${story.id}/versions`).set(owner.auth).expect(201)

      await t.http().get(`/api/v1/stories/${story.id}/versions`).set(other.auth).expect(403)
      await t.http().get(`/api/v1/stories/${story.id}/versions/1`).set(other.auth).expect(403)
      await t.http().get(`/api/v1/stories/${story.id}/versions`).set(owner.auth).expect(200)
    })
  })

  it('refuses a parent that would make a cycle', async () => {
    const a = await save()
    const b = await save({ parentId: a.id })

    await t
      .http()
      .patch(`/api/v1/stories/${a.id}`)
      .set(owner.auth)
      .send({ parentId: b.id })
      .expect(400)
    expect((await stories().findOneByOrFail({ id: a.id })).parentId).toBeNull()
  })

  it('does not set a main image on a deleted story', async () => {
    const story = await save()
    const image = await t.dataSource.getRepository(Attachment).save({
      userId: owner.user.id,
      path: `uploads/${owner.user.id}/main.png`,
      originalName: 'main.png',
      mimeType: 'image/png',
      size: 1024,
      isPublic: true
    })
    await t.http().delete(`/api/v1/stories/${story.id}`).set(owner.auth).expect(204)

    await t
      .http()
      .put(`/api/v1/stories/${story.id}/main-image`)
      .set(owner.auth)
      .send({ attachmentId: image.id })
      .expect(404)
    expect((await stories().findOneByOrFail({ id: story.id })).mainImageId).toBeNull()
  })

  describe('linking', () => {
    it('refuses deleted categories and accepts repeated ids', async () => {
      const story = await save()
      const live = await category('live')
      const gone = await category('gone', new Date())

      await t
        .http()
        .post(`/api/v1/stories/${story.id}/categories`)
        .set(owner.auth)
        .send({ categoryIds: [gone.id] })
        .expect(400)
      await t
        .http()
        .post(`/api/v1/stories/${story.id}/categories`)
        .set(owner.auth)
        .send({ categoryIds: [live.id, live.id] })
        .expect(201)
    })

    it('returns the whole story, author included', async () => {
      const story = await save()

      const res = await t
        .http()
        .post(`/api/v1/stories/${story.id}/tags`)
        .set(owner.auth)
        .send({ tags: ['alpha'] })
        .expect(201)
      expect(res.body.data.user).toEqual({ id: owner.user.id, name: owner.user.name })
      expect(res.body.data.tags.map((x: { name: string }) => x.name)).toEqual(['alpha'])
    })
  })
})
