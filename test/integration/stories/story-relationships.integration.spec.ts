/**
 * Linking tags, categories and attachments to a story over HTTP: attach (deduplicated,
 * tags by id or by name, creating missing names), detach, the story owner only, the
 * attachment ownership rule, and reads (404 for a soft-deleted story, as GET /stories/:id).
 */
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { CategoriesModule } from '@modules/categories/categories.module'
import { Category } from '@modules/categories/entities/category.entity'
import { Story } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { Tag } from '@modules/tags/entities/tag.entity'
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

describe('Story relationships', () => {
  let t: HttpTestApp
  let owner: Actor
  let other: Actor
  let story: Story

  const url = (path: string) => `/api/v1/stories/${story.id}/${path}`
  const linked = async (relation: 'tags' | 'categories' | 'attachments') =>
    (
      await t.dataSource
        .getRepository(Story)
        .findOneOrFail({ where: { id: story.id }, relations: { [relation]: true } })
    )[relation] as Array<{ id: string | number }>

  const tag = (name: string) =>
    t.dataSource.getRepository(Tag).save({ name, createdBy: owner.user.id } as Tag)
  const category = (name: string) =>
    t.dataSource.getRepository(Category).save({ name, slug: name } as Category)
  const attachment = (by: Actor, isPublic: boolean) =>
    t.dataSource.getRepository(Attachment).save({
      userId: by.user.id,
      path: `uploads/${by.user.id}/${Math.random()}.png`,
      originalName: 'file.png',
      mimeType: 'image/png',
      size: 1024,
      isPublic
    })

  beforeAll(async () => {
    t = await createHttpTestApp([AttachmentsModule, TagsModule, CategoriesModule, StoriesModule], {
      resetTables: TABLES
    })
    owner = await t.signUp('owner@story-relationships.test', 'user')
    other = await t.signUp('other@story-relationships.test', 'user')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM story_attachments; DELETE FROM story_tags; DELETE FROM story_categories; ' +
        'DELETE FROM story_versions; DELETE FROM stories; DELETE FROM attachments; ' +
        'DELETE FROM tags; DELETE FROM categories'
    )
    await t.cache.reset()
    story = await t.dataSource
      .getRepository(Story)
      .save(StoryFactory.create({ userId: owner.user.id, createdBy: owner.user.id }) as Story)
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  describe('tags', () => {
    it('attaches by id and by name (creating new names), once each', async () => {
      const existing = await tag('economy')

      await t
        .http()
        .post(url('tags'))
        .set(owner.auth)
        .send({ tagIds: [existing.id], tags: ['Economy', ' Sports '] })
        .expect(201)
      await t
        .http()
        .post(url('tags'))
        .set(owner.auth)
        .send({ tagIds: [existing.id] })
        .expect(201)

      const names = (await t.http().get(url('tags')).set(owner.auth).expect(200)).body.data.map(
        (x: Tag) => x.name
      )
      expect(names.sort()).toEqual(['economy', 'sports'])
    })

    it('detaches by name, and needs at least one id or name', async () => {
      await t
        .http()
        .post(url('tags'))
        .set(owner.auth)
        .send({ tags: ['alpha', 'beta'] })
        .expect(201)

      await t
        .http()
        .delete(url('tags'))
        .set(owner.auth)
        .send({ tags: ['alpha'] })
        .expect(200)
      expect(((await linked('tags')) as Tag[]).map(x => x.name)).toEqual(['beta'])

      await t.http().post(url('tags')).set(owner.auth).send({}).expect(400)
      await t.http().delete(url('tags')).set(owner.auth).send({ tagIds: [] }).expect(400)
    })

    it('rejects unknown tag ids', async () => {
      await t
        .http()
        .post(url('tags'))
        .set(owner.auth)
        .send({ tagIds: [999999] })
        .expect(400)
    })
  })

  describe('categories', () => {
    it('attaches once, detaches, and rejects unknown ids', async () => {
      const news = await category('news')

      await t
        .http()
        .post(url('categories'))
        .set(owner.auth)
        .send({ categoryIds: [news.id] })
      await t
        .http()
        .post(url('categories'))
        .set(owner.auth)
        .send({ categoryIds: [news.id] })
      expect(await linked('categories')).toHaveLength(1)

      await t
        .http()
        .post(url('categories'))
        .set(owner.auth)
        .send({ categoryIds: ['00000000-0000-4000-8000-000000000000'] })
        .expect(400)

      await t
        .http()
        .delete(url('categories'))
        .set(owner.auth)
        .send({ categoryIds: [news.id] })
        .expect(200)
      expect(await linked('categories')).toHaveLength(0)
    })
  })

  describe('attachments', () => {
    it("links your own files and public ones, not another user's private file", async () => {
      const mine = await attachment(owner, false)
      const shared = await attachment(other, true)
      const theirs = await attachment(other, false)

      await t
        .http()
        .post(url('attachments'))
        .set(owner.auth)
        .send({ attachmentIds: [mine.id, shared.id] })
        .expect(201)
      await t
        .http()
        .post(url('attachments'))
        .set(owner.auth)
        .send({ attachmentIds: [theirs.id] })
        .expect(400)

      const listed = await t.http().get(url('attachments')).set(owner.auth).expect(200)
      expect(listed.body.data.map((a: Attachment) => a.id).sort()).toEqual(
        [mine.id, shared.id].sort()
      )

      await t
        .http()
        .delete(url('attachments'))
        .set(owner.auth)
        .send({ attachmentIds: [mine.id] })
        .expect(200)
      expect((await linked('attachments')).map(a => a.id)).toEqual([shared.id])
    })
  })

  it("refuses changes to another user's story", async () => {
    const news = await category('news')

    await t
      .http()
      .post(url('tags'))
      .set(other.auth)
      .send({ tags: ['xray'] })
      .expect(403)
    await t
      .http()
      .post(url('categories'))
      .set(other.auth)
      .send({ categoryIds: [news.id] })
      .expect(403)
    expect(await linked('tags')).toHaveLength(0)
    expect(await linked('categories')).toHaveLength(0)
  })

  it('answers 404 for the links of a soft-deleted story, like the story itself', async () => {
    await t.dataSource.getRepository(Story).update(story.id, { deletedAt: new Date() })
    await t.cache.reset()

    await t.http().get(`/api/v1/stories/${story.id}`).set(owner.auth).expect(404)
    for (const relation of ['tags', 'categories', 'attachments']) {
      await t.http().get(url(relation)).set(owner.auth).expect(404)
    }
    await t
      .http()
      .post(url('tags'))
      .set(owner.auth)
      .send({ tags: ['xray'] })
      .expect(404)
  })
})
