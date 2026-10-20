/**
 * Tag edge cases: names are unique among live tags (a deleted tag's name is free, clashes
 * answer 409, not 500), system tags are managed by super-admins only, the public list
 * hides who changed a tag and is capped, deleted tags leave stories, and a tag outlives
 * the user who created it.
 */
import { Story } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { Tag } from '@modules/tags/entities/tag.entity'
import { TagsModule } from '@modules/tags/tags.module'

import { StoryFactory } from '../../factories/story.factory'
import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'story_tags',
  'story_versions',
  'stories',
  'tags',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Tag hardening', () => {
  let t: HttpTestApp
  let admin: Actor
  let root: Actor

  const api = '/api/v1/tags'
  const create = (body: object, actor = admin) => t.http().post(api).set(actor.auth).send(body)
  const remove = (id: number, actor = admin) => t.http().delete(`${api}/${id}`).set(actor.auth)
  const tags = () => t.dataSource.getRepository(Tag)

  beforeAll(async () => {
    t = await createHttpTestApp([TagsModule, StoriesModule], { resetTables: TABLES })
    admin = await t.signUp('admin@tag-hardening.test', 'admin')
    root = await t.signUp('root@tag-hardening.test', 'super-admin')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM story_tags; DELETE FROM story_versions; DELETE FROM stories; DELETE FROM tags'
    )
    await t.cache.reset()
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it("frees a deleted tag's name and answers 409 for a live one however it is typed", async () => {
    const first = (await create({ name: 'sports' }).expect(201)).body.data
    await create({ name: '  Sports ' }).expect(409)
    await remove(first.id).expect(204)

    const again = await create({ name: 'Sports' }).expect(201)
    expect(again.body.data.name).toBe('sports')
    const other = (await create({ name: 'weather' }).expect(201)).body.data
    await t.http().patch(`${api}/${other.id}`).set(admin.auth).send({ name: ' SPORTS' }).expect(409)
  })

  it('leaves system tags to super-admins', async () => {
    await create({ name: 'featured', isSystem: true }).expect(403)
    const system = (await create({ name: 'featured', isSystem: true }, root).expect(201)).body.data

    await t
      .http()
      .patch(`${api}/${system.id}`)
      .set(admin.auth)
      .send({ color: '#000000' })
      .expect(403)
    await remove(system.id).expect(403)
    const plain = (await create({ name: 'plain' }).expect(201)).body.data
    await t.http().patch(`${api}/${plain.id}`).set(admin.auth).send({ isSystem: true }).expect(403)

    await t
      .http()
      .patch(`${api}/${system.id}`)
      .set(root.auth)
      .send({ color: '#000000' })
      .expect(200)
    await remove(system.id, root).expect(204)
  })

  it('lists tags publicly without who changed them, capped and searchable', async () => {
    for (const name of ['alpha', 'alpine', 'beta']) await create({ name }).expect(201)

    const all = await t.http().get(api).expect(200)
    expect(all.body.data).toHaveLength(3)
    for (const tag of all.body.data) {
      expect(tag).not.toHaveProperty('createdBy')
      expect(tag).not.toHaveProperty('updatedBy')
      expect(tag).not.toHaveProperty('deletedBy')
    }

    const page = await t.http().get(api).query({ sortBy: 'name', limit: 2 }).expect(200)
    expect(page.body.data.map((tag: Tag) => tag.name)).toEqual(['alpha', 'alpine'])
    const found = await t.http().get(api).query({ search: 'alp' }).expect(200)
    expect(found.body.data.map((tag: Tag) => tag.name).sort()).toEqual(['alpha', 'alpine'])
    await t.http().get(api).query({ limit: 1000 }).expect(400)
  })

  it('validates metadata', async () => {
    await create({ name: 'meta', metadata: 'not-an-object' }).expect(400)
  })

  it('drops deleted tags from stories and refuses to attach them', async () => {
    const kept = (await create({ name: 'kept' }).expect(201)).body.data
    const gone = (await create({ name: 'gone' }).expect(201)).body.data
    const story = await t.dataSource
      .getRepository(Story)
      .save(StoryFactory.create({ userId: admin.user.id, createdBy: admin.user.id }) as Story)
    await t.dataSource.query(
      'INSERT INTO story_tags ("storyId", "tagId") VALUES ($1, $2), ($1, $3)',
      [story.id, kept.id, gone.id]
    )
    await remove(gone.id).expect(204)

    const res = await t.http().get(`/api/v1/stories/${story.id}`).set(admin.auth).expect(200)
    expect(res.body.data.tags.map((tag: Tag) => tag.id)).toEqual([kept.id])

    const tagsOf = `/api/v1/stories/${story.id}/tags`
    await t
      .http()
      .post(tagsOf)
      .set(admin.auth)
      .send({ tagIds: [gone.id] })
      .expect(400)
    // By name: a new live tag, not the deleted one
    await t
      .http()
      .post(tagsOf)
      .set(admin.auth)
      .send({ tags: ['gone'] })
      .expect(201)
    const [live] = await t.dataSource.query(
      `SELECT id FROM tags WHERE name = 'gone' AND "deletedAt" IS NULL`
    )
    const shown = await t.http().get(`/api/v1/stories/${story.id}`).set(admin.auth).expect(200)
    expect(shown.body.data.tags.map((tag: Tag) => tag.id).sort()).toEqual([kept.id, live.id].sort())
  })

  it('keeps tags when the user who created them is deleted', async () => {
    const author = await t.signUp('author@tag-hardening.test', 'admin')
    const tag = (await create({ name: 'orphan' }, author).expect(201)).body.data

    await t.dataSource.query('DELETE FROM sessions WHERE "userId" = $1', [author.user.id])
    await t.dataSource.query('DELETE FROM users WHERE id = $1', [author.user.id])

    const stored = await tags().findOneBy({ id: tag.id })
    expect(stored).toMatchObject({ name: 'orphan', createdBy: null })
  })
})
