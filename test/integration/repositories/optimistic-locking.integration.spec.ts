/**
 * Optimistic locking on every versioned resource: an update applies only to the version
 * it was made against. A client that sends the version it last read gets 409
 * VERSION_CONFLICT when someone changed the record since; concurrent updates without a
 * version cannot silently overwrite each other either. Before, `version` was incremented
 * but never checked.
 */
import { ErrorCode } from '@shared/errors'

import { CategoriesModule } from '@modules/categories/categories.module'
import { PostContent } from '@modules/post-types/entities/post-content.entity'
import { PostTypesModule } from '@modules/post-types/post-types.module'
import { ContentService } from '@modules/post-types/services/content.service'
import { Story } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'post_content',
  'field_definitions',
  'post_types',
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

describe('Optimistic locking', () => {
  let t: HttpTestApp
  let admin: Actor

  const post = (path: string, body: object) =>
    t.http().post(`/api/v1${path}`).set(admin.auth).send(body).expect(201)
  const patch = (path: string, body: object) =>
    t.http().patch(`/api/v1${path}`).set(admin.auth).send(body)

  /** Updates with the version read, then again with that (now stale) version */
  const expectVersioned = async (path: string, change: object, otherChange: object) => {
    const first = await patch(path, { ...change, version: 1 }).expect(200)
    expect(first.body.data.version).toBe(2)

    const stale = await patch(path, { ...otherChange, version: 1 }).expect(409)
    expect(stale.body.code).toBe(ErrorCode.VERSION_CONFLICT)
  }

  beforeAll(async () => {
    t = await createHttpTestApp([TagsModule, CategoriesModule, StoriesModule, PostTypesModule], {
      resetTables: TABLES
    })
    admin = await t.signUp('admin@optimistic-locking.test', 'admin')
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('tags', async () => {
    const tag = (await post('/tags', { name: 'locked-tag' })).body.data
    expect(tag.version).toBe(1)
    await expectVersioned(`/tags/${tag.id}`, { color: '#111111' }, { color: '#222222' })
  })

  it('categories', async () => {
    const category = (await post('/categories', { name: 'Locked' })).body.data
    await expectVersioned(
      `/categories/${category.id}`,
      { description: 'first' },
      { description: 'second' }
    )
  })

  it('stories', async () => {
    const story = (
      await post('/stories', {
        title: 'Locked story',
        details: 'Some details here',
        type: 'REPORT',
        status: 'DRAFT',
        priority: 'NORMAL'
      })
    ).body.data
    await expectVersioned(`/stories/${story.id}`, { title: 'First edit' }, { title: 'Second edit' })
  })

  it('post types, their fields and their content', async () => {
    const postType = (
      await post('/post-types', { name: 'Locked', singularLabel: 'Locked', pluralLabel: 'Locked' })
    ).body.data
    expect(postType.version).toBe(1)
    await expectVersioned(
      `/post-types/${postType.id}`,
      { description: 'first' },
      { description: 'second' }
    )

    const field = (
      await post(`/post-types/${postType.id}/fields`, {
        name: 'venue',
        label: 'Venue',
        fieldType: 'text'
      })
    ).body.data
    await expectVersioned(
      `/post-types/${postType.id}/fields/${field.id}`,
      { label: 'Place' },
      { label: 'Location' }
    )

    const entry = (
      await post(`/content/${postType.slug}`, { title: 'Locked entry', field_data: {} })
    ).body.data
    await expectVersioned(
      `/content/${postType.slug}/${entry.id}`,
      { title: 'First' },
      { title: 'Second' }
    )
  })

  // A15: lifecycle and relationship writers follow the same protocol as PATCH
  describe('every writer, not only PATCH', () => {
    const newStory = async () =>
      (
        await post('/stories', {
          title: `Story ${Date.now()}-${Math.random()}`,
          details: 'Some details here',
          type: 'REPORT',
          status: 'DRAFT',
          priority: 'NORMAL'
        })
      ).body.data
    const newEntry = async () => {
      const postType = (
        await post('/post-types', {
          name: `Lifecycle ${Date.now()}`,
          singularLabel: 'Item',
          pluralLabel: 'Items'
        })
      ).body.data
      const entry = (
        await post(`/content/${postType.slug}`, { title: 'Lifecycle entry', field_data: {} })
      ).body.data
      return { slug: postType.slug as string, entry }
    }

    it('a story status change moves the version on: an edit made against the old one is refused', async () => {
      const story = await newStory()

      const changed = await t
        .http()
        .patch(`/api/v1/stories/${story.id}/status`)
        .set(admin.auth)
        .send({ status: 'IN_REVIEW' })
        .expect(200)
      expect(changed.body.data.version).toBe(2)

      await patch(`/stories/${story.id}`, { title: 'Stale edit', version: 1 }).expect(409)
    })

    it('publishing content moves the version on', async () => {
      const { slug, entry } = await newEntry()

      await t.http().post(`/api/v1/content/${slug}/${entry.id}/publish`).set(admin.auth).expect(200)

      await patch(`/content/${slug}/${entry.id}`, { title: 'Stale edit', version: 1 }).expect(409)
    })

    it('scheduled publishing moves the version on', async () => {
      const { entry } = await newEntry()
      await t.dataSource.getRepository(PostContent).update(entry.id, {
        status: 'scheduled' as never,
        scheduledAt: new Date(Date.now() - 1000)
      })

      await t.app.get(ContentService).publishDue(new Date())

      const stored = await t.dataSource.getRepository(PostContent).findOneByOrFail({ id: entry.id })
      expect(stored.version).toBe(2)
    })

    it('keeps every tag of concurrent attach requests', async () => {
      const story = await newStory()
      const names = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']

      const results = await Promise.all(
        names.map(name =>
          t
            .http()
            .post(`/api/v1/stories/${story.id}/tags`)
            .set(admin.auth)
            .send({ tags: [`race-${name}`] })
        )
      )
      expect(results.map(res => res.status)).toEqual(names.map(() => 201))

      const stored = await t.dataSource
        .getRepository(Story)
        .findOneOrFail({ where: { id: story.id }, relations: { tags: true } })
      expect(stored.tags!.map(tag => tag.name).sort()).toEqual(names.map(name => `race-${name}`))
      // Each change moved the version on
      expect(stored.version).toBe(1 + names.length)
    })
  })

  it('never loses either of two concurrent story edits', async () => {
    const story = (
      await post('/stories', {
        title: 'Race',
        details: 'Original details',
        type: 'REPORT',
        status: 'DRAFT',
        priority: 'NORMAL'
      })
    ).body.data

    const [title, details] = await Promise.all([
      patch(`/stories/${story.id}`, { title: 'Race, retitled' }),
      patch(`/stories/${story.id}`, { details: 'Rewritten details' })
    ])

    const stored = await t.dataSource.getRepository(Story).findOneByOrFail({ id: story.id })
    // Each update either applied (and is still there) or was refused with 409
    for (const [res, applied] of [
      [title, stored.title === 'Race, retitled'],
      [details, stored.details === 'Rewritten details']
    ] as const) {
      expect([200, 409]).toContain(res.status)
      expect(applied).toBe(res.status === 200)
    }
  })
})
