/**
 * Version retention: per story and branch, only the newest N automatic versions are kept,
 * plus every version something depends on (manual, branch, merge and rollback versions,
 * tagged, pinned, branch points, merge and rollback sources). The parent chain of what is
 * kept is re-pointed past the deleted versions, so merges still find common ancestors.
 */
import { Job, Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

import { Story } from '@modules/stories/entities/story.entity'
import { StoryVersion, VersionType } from '@modules/stories/entities/story-version.entity'
import { VersionCleanupProcessor } from '@modules/stories/jobs/version-cleanup.processor'
import { StoryVersionRepository } from '@modules/stories/repositories/story-version.repository'
import { StoriesModule } from '@modules/stories/stories.module'

import { VersionCleanupJobType } from '@core/queues/jobs/types'

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

type Seed = Partial<StoryVersion> & { parent?: number; rolledBackFrom?: number }

describe('Story version retention', () => {
  let t: HttpTestApp
  let author: Actor
  let processor: VersionCleanupProcessor

  const prune = (keepAutoVersions: number) =>
    processor.process({
      id: '1',
      name: VersionCleanupJobType.PRUNE_AUTO,
      data: { keepAutoVersions }
    } as Job)

  /** Saves versions numbered 1..n in order; `parent` and `rolledBackFrom` are numbers */
  const seed = async (story: Story, seeds: Seed[]) => {
    const ids = new Map<number, string>()
    for (const [index, { parent, rolledBackFrom, ...fields }] of seeds.entries()) {
      const number = index + 1
      const saved = await t.dataSource.getRepository(StoryVersion).save({
        storyId: story.id,
        versionNumber: number,
        versionType: VersionType.AUTO,
        branchName: 'main',
        title: `v${number}`,
        type: story.type,
        storyStatus: story.status,
        priority: story.priority,
        createdBy: author.user.id,
        parentVersionId: parent ? ids.get(parent) : number > 1 ? ids.get(number - 1) : null,
        rolledBackFromVersionId: rolledBackFrom ? ids.get(rolledBackFrom) : null,
        ...fields
      } as StoryVersion)
      ids.set(number, saved.id)
    }
  }
  const remaining = async (story: Story) => {
    const versions = await t.dataSource
      .getRepository(StoryVersion)
      .find({ where: { storyId: story.id }, order: { versionNumber: 'ASC' } })
    const numberOf = new Map(versions.map(v => [v.id, v.versionNumber]))
    return versions.map(v => [
      v.versionNumber,
      v.parentVersionId ? numberOf.get(v.parentVersionId) : null
    ])
  }

  beforeAll(async () => {
    t = await createHttpTestApp([StoriesModule], { resetTables: TABLES })
    author = await t.signUp('author@version-retention.test', 'user')
    processor = new VersionCleanupProcessor(
      t.app.get(StoryVersionRepository),
      {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      } as unknown as PinoLogger,
      {} as Queue
    )
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('keeps the newest automatic versions and every version something depends on', async () => {
    const story = await t.dataSource
      .getRepository(Story)
      .save(StoryFactory.create({ userId: author.user.id }) as Story)
    await seed(story, [
      {}, // 1: a rollback source (12)
      {}, // 2: deleted
      { versionType: VersionType.MANUAL }, // 3
      { tag: 'release-1' }, // 4
      { isPinned: true }, // 5
      {}, // 6: branch point (11)
      {}, // 7: deleted
      {}, // 8: deleted
      {}, // 9: second newest automatic
      {}, // 10: newest automatic
      { versionType: VersionType.BRANCH, branchName: 'feature', parent: 6 }, // 11
      { versionType: VersionType.ROLLBACK, parent: 10, rolledBackFrom: 1 } // 12
    ])

    expect(await prune(2)).toEqual({ deleted: 3 })

    expect(await remaining(story)).toEqual([
      [1, null],
      [3, 1],
      [4, 3],
      [5, 4],
      [6, 5],
      [9, 6],
      [10, 9],
      [11, 6],
      [12, 10]
    ])
    // Nothing left to prune
    expect(await prune(2)).toEqual({ deleted: 0 })
  })
})
