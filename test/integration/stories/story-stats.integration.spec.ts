/**
 * GET /api/v1/stories/stats: counts per status/type/priority, recent creations,
 * soft-deleted stories, and that a new story shows up (the stats cache is invalidated
 * by writes, not only by its TTL).
 */
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import {
  Story,
  StoryPriority,
  StoryStatus,
  StoryType
} from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'

import { StoryFactory } from '../../factories/story.factory'
import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'story_versions',
  'stories',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Story statistics', () => {
  let t: HttpTestApp
  let admin: Actor

  const save = (overrides: Partial<Story>) =>
    t.dataSource.getRepository(Story).save(
      StoryFactory.create({
        userId: admin.user.id,
        createdBy: admin.user.id,
        ...overrides
      }) as Story
    )
  const stats = async () =>
    (await t.http().get('/api/v1/stories/stats').set(admin.auth).expect(200)).body.data

  beforeAll(async () => {
    t = await createHttpTestApp([AttachmentsModule, TagsModule, StoriesModule], {
      resetTables: TABLES
    })
    admin = await t.signUp('admin@story-stats.test', 'super-admin')
  })

  beforeEach(async () => {
    await t.dataSource.query('DELETE FROM story_versions; DELETE FROM stories')
    await t.cache.reset()
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('counts live stories by status, type and priority, and soft-deleted ones apart', async () => {
    await save({
      status: StoryStatus.PUBLISHED,
      type: StoryType.STORY,
      priority: StoryPriority.HIGH
    })
    await save({
      status: StoryStatus.PUBLISHED,
      type: StoryType.STORY,
      priority: StoryPriority.LOW
    })
    await save({ status: StoryStatus.DRAFT, type: StoryType.STORY, priority: StoryPriority.LOW })
    await save({ status: StoryStatus.DRAFT, deletedAt: new Date() })

    const result = await stats()

    expect(result).toMatchObject({
      total: 3,
      published: 2,
      drafts: 1,
      deleted: 1,
      createdToday: 3,
      createdThisWeek: 3
    })
    expect(result.byStatus).toEqual({ [StoryStatus.PUBLISHED]: 2, [StoryStatus.DRAFT]: 1 })
    expect(result.byPriority[StoryPriority.LOW]).toBe(2)
  })

  it('reflects a new story right away', async () => {
    await save({ status: StoryStatus.DRAFT })
    expect((await stats()).total).toBe(1) // cached now

    await t
      .http()
      .post('/api/v1/stories')
      .set(admin.auth)
      .send(StoryFactory.create({ title: 'Fresh story', details: 'Created through the API' }))
      .expect(201)

    expect((await stats()).total).toBe(2)
  })
})
