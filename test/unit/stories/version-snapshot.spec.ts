import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import { StoryVersion } from '@modules/stories/entities/story-version.entity'
import {
  contentHash,
  detectConflicts,
  diffSnapshots,
  mergeSnapshots,
  snapshotOfStory,
  snapshotOfVersion,
  summarizeChanges,
  versionContentFromSnapshot
} from '@modules/stories/services/versioning/version-snapshot'

describe('version snapshots', () => {
  const story = {
    title: 'T',
    status: StoryStatus.DRAFT,
    fromTime: new Date('2026-01-01T10:00:00Z'),
    tags: [{ id: 1 }],
    metadata: { a: 1 }
  } as unknown as Story

  it('accepts cached (JSON) entities whose dates are strings', () => {
    const cached = JSON.parse(JSON.stringify(story)) as Story

    expect(snapshotOfStory(cached)).toEqual(snapshotOfStory(story))
    expect(snapshotOfStory(cached).fromTime).toBe('2026-01-01T10:00:00.000Z')
    const version = JSON.parse(JSON.stringify({ fromTime: story.fromTime })) as StoryVersion
    expect(snapshotOfVersion(version).fromTime).toBe('2026-01-01T10:00:00.000Z')
  })

  it('hashes independently of key order', () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }))
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }))
  })

  it('diffs added, modified and removed fields', () => {
    const diff = diffSnapshots({ a: 1, b: [1], c: 3 }, { a: 2, b: [1], d: 4 })

    expect(diff).toEqual({
      added: { d: 4 },
      modified: { a: { old: 1, new: 2 } },
      removed: { c: 3 }
    })
    expect(summarizeChanges(diff)).toBe('1 field(s) added; Modified: a; 1 field(s) removed')
  })

  it('flags a conflict only when both sides changed a field differently', () => {
    const base = { title: 'base', city: 'x', region: 'r' }

    expect(
      detectConflicts(base, { ...base, title: 'mine', city: 'y' }, { ...base, title: 'theirs' })
    ).toEqual([{ field: 'title', baseValue: 'base', sourceValue: 'mine', targetValue: 'theirs' }])
  })

  it('maps a merged snapshot back to version content without touching the version status', () => {
    const content = versionContentFromSnapshot(snapshotOfStory(story))

    expect(content.storyStatus).toBe(StoryStatus.DRAFT)
    expect('status' in content).toBe(false)
    expect(content.fromTime).toEqual(new Date('2026-01-01T10:00:00Z'))
  })

  it('takes only content fields from client-supplied conflict resolutions', () => {
    const merged = mergeSnapshots(snapshotOfStory(story), {
      title: 'resolved',
      id: 'another-version',
      createdBy: 'someone-else'
    })

    expect(merged.title).toBe('resolved')
    expect(merged).not.toHaveProperty('id')
    expect(merged).not.toHaveProperty('createdBy')
  })
})
