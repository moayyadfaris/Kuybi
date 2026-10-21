/**
 * Idempotency-Key over HTTP. A key covers one concrete request: the same key on another
 * resource (another post type behind the same route) or with another query string is a
 * different request, never a replay of the first. Once the work has succeeded, a failure
 * to store its outcome must not turn the success into a 500 and free the key: the
 * client would retry and the work would run twice.
 */
import { PostType } from '@modules/post-types/entities/post-type.entity'
import { PostTypesModule } from '@modules/post-types/post-types.module'
import { Story } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'

import { IdempotencyService } from '@core/idempotency/idempotency.service'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'idempotency_keys',
  'post_content',
  'field_definitions',
  'post_types',
  'story_versions',
  'stories',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]
const story = {
  title: 'A story',
  details: 'Some details',
  type: 'REPORT',
  status: 'DRAFT',
  priority: 'NORMAL'
}

describe('Idempotent requests', () => {
  let t: HttpTestApp
  let admin: Actor

  const postType = (slug: string) =>
    t.dataSource.getRepository(PostType).save({
      name: slug,
      slug,
      singularLabel: slug,
      pluralLabel: slug,
      isActive: true
    } as PostType)
  const stories = () => t.dataSource.getRepository(Story).count()

  beforeAll(async () => {
    t = await createHttpTestApp([StoriesModule, PostTypesModule], { resetTables: TABLES })
    admin = await t.signUp('admin@idempotent-requests.test', 'admin')
  })

  beforeEach(async () => {
    jest.restoreAllMocks()
    await t.dataSource.query(
      'DELETE FROM idempotency_keys; DELETE FROM post_content; DELETE FROM post_types; DELETE FROM story_versions; DELETE FROM stories'
    )
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('does not replay one resource for another behind the same route', async () => {
    await postType('news')
    await postType('events')
    const create = (slug: string) =>
      t
        .http()
        .post(`/api/v1/content/${slug}`)
        .set(admin.auth)
        .set('Idempotency-Key', 'same-key')
        .send({ title: 'Same title', field_data: {} })

    await create('news').expect(201)
    const events = await create('events').expect(201)

    expect(events.headers['idempotent-replayed']).toBeUndefined()
    const [{ count }] = await t.dataSource.query(
      `SELECT count(*)::int AS count FROM post_content c JOIN post_types t ON t.id = c."postTypeId"
        WHERE t.slug = 'events'`
    )
    expect(count).toBe(1)
  })

  it('treats another query string as another request', async () => {
    const create = (query: string) =>
      t
        .http()
        .post(`/api/v1/stories${query}`)
        .set(admin.auth)
        .set('Idempotency-Key', 'query-key')
        .send(story)

    await create('?draft=1').expect(201)
    await create('?draft=2').expect(422)
  })

  it('keeps a success, and the key, when storing the outcome fails', async () => {
    jest
      .spyOn(t.app.get(IdempotencyService), 'complete')
      .mockRejectedValueOnce(new Error('idempotency store down'))
    const create = () =>
      t
        .http()
        .post('/api/v1/stories')
        .set(admin.auth)
        .set('Idempotency-Key', 'store-key')
        .send(story)

    await create().expect(201)
    const retry = await create()

    expect(retry.status).not.toBe(500)
    expect(await stories()).toBe(1)
  })
})
