/**
 * Who can read which stories. Published stories are readable by every role with story
 * read access (guest included); every other status (drafts, review, archived...) only
 * by the author and by roles that read every story (moderator, admin, super-admin).
 * Hidden stories answer 404 everywhere: by id, in every list, in stats, through their
 * links and versions. The public web API serves published, live stories only.
 */
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { Story, StoryStatus, StoryType } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'
import { WebModule } from '@modules/web/web.module'

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

describe('Story visibility', () => {
  let t: HttpTestApp
  let author: Actor
  let reader: Actor
  let guest: Actor
  let moderator: Actor
  let parent: Story
  let published: Story
  let draft: Story
  let archived: Story
  let deletedPublished: Story

  const save = (overrides: Partial<Story>) =>
    t.dataSource.getRepository(Story).save(
      StoryFactory.create({
        userId: author.user.id,
        createdBy: author.user.id,
        type: StoryType.REPORT,
        ...overrides
      }) as Story
    )
  const get = (as: Actor, path: string, query: Record<string, string> = {}) =>
    t.http().get(`/api/v1/stories${path}`).query(query).set(as.auth)
  const titles = (stories: Story[]) => stories.map(s => s.title).sort()

  beforeAll(async () => {
    t = await createHttpTestApp([AttachmentsModule, TagsModule, StoriesModule, WebModule], {
      resetTables: TABLES
    })
    author = await t.signUp('author@story-visibility.test', 'user')
    reader = await t.signUp('reader@story-visibility.test', 'user')
    guest = await t.signUp('guest@story-visibility.test', 'guest')
    moderator = await t.signUp('moderator@story-visibility.test', 'moderator')

    parent = await save({ title: 'Parent', status: StoryStatus.PUBLISHED })
    published = await save({
      title: 'Published',
      status: StoryStatus.PUBLISHED,
      parentId: parent.id
    })
    draft = await save({ title: 'Draft', status: StoryStatus.DRAFT, parentId: parent.id })
    archived = await save({ title: 'Archived', status: StoryStatus.ARCHIVED })
    deletedPublished = await save({
      title: 'Deleted',
      status: StoryStatus.PUBLISHED,
      deletedAt: new Date()
    })
  })

  beforeEach(() => t.cache.reset())

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  describe('another user', () => {
    it('reads published stories and gets 404 for drafts and archived ones', async () => {
      await get(reader, `/${published.id}`).expect(200)
      await get(reader, `/${draft.id}`).expect(404)
      await get(reader, `/${archived.id}`).expect(404)
    })

    it('sees only published stories in every list', async () => {
      const all = await get(reader, '').expect(200)
      expect(titles(all.body.data.results)).toEqual(['Parent', 'Published'])
      expect(all.body.data.total).toBe(2)

      const byAuthor = await get(reader, `/user/${author.user.id}`).expect(200)
      expect(titles(byAuthor.body.data)).toEqual(['Parent', 'Published'])

      expect((await get(reader, '/status/DRAFT').expect(200)).body.data).toEqual([])
      expect((await get(reader, '/status/ARCHIVED').expect(200)).body.data).toEqual([])

      const byType = await get(reader, `/type/${StoryType.REPORT}`).expect(200)
      expect(titles(byType.body.data)).toEqual(['Parent', 'Published'])

      const children = await get(reader, `/${parent.id}/children`).expect(200)
      expect(titles(children.body.data)).toEqual(['Published'])
    })

    it('cannot list deleted stories, even when asking', async () => {
      const res = await get(reader, '', { includeDeleted: 'true' }).expect(200)
      expect(titles(res.body.data.results)).toEqual(['Parent', 'Published'])

      const byAuthor = await get(reader, `/user/${author.user.id}`, { includeDeleted: 'true' })
      expect(titles(byAuthor.body.data)).toEqual(['Parent', 'Published'])
    })

    it('counts only the stories it can see', async () => {
      const stats = (await get(reader, '/stats').expect(200)).body.data
      expect(stats).toMatchObject({ total: 2, published: 2, drafts: 0, deleted: 0 })
      expect(stats.byStatus).toEqual({ [StoryStatus.PUBLISHED]: 2 })
    })

    it("gets 404 for a hidden story's links and versions", async () => {
      for (const path of ['tags', 'categories', 'attachments', 'versions']) {
        await get(reader, `/${draft.id}/${path}`).expect(404)
      }
      await get(reader, `/${draft.id}/versions/branches/info`).expect(404)
      await get(reader, `/${published.id}/tags`).expect(200)
    })
  })

  it('the author sees their own stories in every status', async () => {
    await get(author, `/${draft.id}`).expect(200)
    await get(author, `/${archived.id}`).expect(200)

    const mine = await get(author, `/user/${author.user.id}`).expect(200)
    expect(titles(mine.body.data)).toEqual(['Archived', 'Draft', 'Parent', 'Published'])

    const drafts = await get(author, '/status/DRAFT').expect(200)
    expect(titles(drafts.body.data)).toEqual(['Draft'])
  })

  it('a guest reads published stories only', async () => {
    await get(guest, `/${published.id}`).expect(200)
    await get(guest, `/${draft.id}`).expect(404)
    const all = await get(guest, '').expect(200)
    expect(titles(all.body.data.results)).toEqual(['Parent', 'Published'])
  })

  it('a moderator reads every story, and the cache keeps each view apart', async () => {
    // Same query, different readers: the reader's cached list must not leak to (or from)
    // the moderator's
    await get(reader, '/status/DRAFT').expect(200)
    const drafts = await get(moderator, '/status/DRAFT').expect(200)
    expect(titles(drafts.body.data)).toEqual(['Draft'])
    expect((await get(reader, '/status/DRAFT').expect(200)).body.data).toEqual([])

    await get(moderator, `/${archived.id}`).expect(200)
    const stats = (await get(moderator, '/stats').expect(200)).body.data
    expect(stats).toMatchObject({ total: 4, deleted: 1 })
  })

  describe('public web API', () => {
    it('serves published, live stories only', async () => {
      await t.http().get(`/api/web/v1/stories/${published.id}`).expect(200)
      await t.http().get(`/api/web/v1/stories/${draft.id}`).expect(404)
      await t.http().get(`/api/web/v1/stories/${deletedPublished.id}`).expect(404)

      const list = await t.http().get('/api/web/v1/stories').expect(200)
      expect(list.body.data.data.map((s: Story) => s.title).sort()).toEqual(['Parent', 'Published'])
    })
  })
})
