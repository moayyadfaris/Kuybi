/**
 * Reads that grow with user data stay bounded: a story's children come in pages, a
 * version's history is walked in SQL (not one query per ancestor), and branch summaries
 * are aggregates (not every version of every branch loaded to count them).
 */
import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import { StoryVersion, VersionType } from '@modules/stories/entities/story-version.entity'
import { StoryVersionRepository } from '@modules/stories/repositories/story-version.repository'
import { StoriesModule } from '@modules/stories/stories.module'

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

describe('Bounded story reads', () => {
  let t: HttpTestApp
  let admin: Actor

  const story = (fields: Partial<Story> = {}) =>
    t.dataSource.getRepository(Story).save(
      StoryFactory.create({
        userId: admin.user.id,
        createdBy: admin.user.id,
        status: StoryStatus.PUBLISHED,
        ...fields
      }) as Story
    )
  /** Versions 1..n, each the parent of the next; branch per version */
  const versions = async (parent: Story, branches: string[]) => {
    const saved: StoryVersion[] = []
    for (const [index, branchName] of branches.entries()) {
      saved.push(
        await t.dataSource.getRepository(StoryVersion).save({
          storyId: parent.id,
          versionNumber: index + 1,
          versionType: VersionType.AUTO,
          branchName,
          title: `v${index + 1}`,
          type: parent.type,
          storyStatus: parent.status,
          priority: parent.priority,
          createdBy: admin.user.id,
          parentVersionId: saved.at(-1)?.id ?? null
        } as StoryVersion)
      )
    }
    return saved
  }

  beforeAll(async () => {
    t = await createHttpTestApp([StoriesModule], { resetTables: TABLES })
    admin = await t.signUp('admin@bounded-reads.test', 'admin')
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it("pages a story's children", async () => {
    const parent = await story()
    for (let i = 0; i < 25; i++) await story({ parentId: parent.id, title: `child ${i}` })
    const children = (query: Record<string, number> = {}) =>
      t.http().get(`/api/v1/stories/${parent.id}/children`).query(query).set(admin.auth)

    expect((await children().expect(200)).body.data).toHaveLength(20)
    expect((await children({ limit: 10, page: 3 }).expect(200)).body.data).toHaveLength(5)
    await children({ limit: 101 }).expect(400)
  })

  it('summarizes branches exactly', async () => {
    const parent = await story()
    await versions(parent, ['main', 'main', 'feature', 'main', 'feature'])

    const info = await t
      .http()
      .get(`/api/v1/stories/${parent.id}/versions/branches/info`)
      .set(admin.auth)
      .expect(200)
    expect(info.body.data).toEqual([
      expect.objectContaining({ name: 'main', versionCount: 3, latestVersion: 4, isMain: true }),
      expect.objectContaining({ name: 'feature', versionCount: 2, latestVersion: 5 })
    ])
  })

  it("walks a version's history without a query per ancestor", async () => {
    const parent = await story()
    const chain = await versions(parent, Array<string>(30).fill('main'))
    const repository = t.app.get(StoryVersionRepository)
    const findOne = jest.spyOn(repository['repository'], 'findOne')

    const history = await repository.getVersionChain(chain.at(-1)!.id, { bypassCache: true })

    expect(history.map(version => version.versionNumber)).toEqual(
      Array.from({ length: 30 }, (_, i) => 30 - i)
    )
    expect(findOne.mock.calls.length).toBeLessThanOrEqual(1)
    findOne.mockRestore()
  })
})
