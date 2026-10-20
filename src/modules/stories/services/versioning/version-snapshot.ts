import { createHash } from 'crypto'

import { VersionDiff } from '../../dto/version/version-comparison.dto'
import { Story, StoryPriority, StoryType } from '../../entities/story.entity'
import { StoryVersion } from '../../entities/story-version.entity'

/**
 * Pure snapshot logic for story versions: what a version captures, how two versions
 * differ, and how branches merge. No I/O.
 *
 * Inputs may come from the cache, where entities are plain JSON (dates are strings),
 * so every date goes through toIso()/toDate() instead of calling Date methods directly.
 */

/** Comparable content of a story or version (dates as ISO strings) */
export type StorySnapshot = Record<string, unknown>

export interface MergeConflict {
  field: string
  baseValue: unknown
  sourceValue: unknown
  targetValue: unknown
}

type DateLike = Date | string | null | undefined

const toIso = (value: DateLike): string | undefined =>
  value === null || value === undefined ? undefined : new Date(value).toISOString()

const toDate = (value: DateLike): Date | null =>
  value === null || value === undefined ? null : new Date(value)

/** Content fields a version stores, copied verbatim between versions */
type VersionContent = Pick<
  StoryVersion,
  | 'title'
  | 'details'
  | 'type'
  | 'storyStatus'
  | 'priority'
  | 'fromTime'
  | 'toTime'
  | 'latitude'
  | 'longitude'
  | 'address'
  | 'city'
  | 'region'
  | 'countryId'
  | 'metadata'
  | 'internalNotes'
  | 'tagIds'
  | 'categoryIds'
  | 'attachmentIds'
  | 'mainImageId'
>

export function snapshotOfStory(story: Story): StorySnapshot {
  return {
    title: story.title,
    details: story.details,
    type: story.type,
    status: story.status,
    priority: story.priority,
    fromTime: toIso(story.fromTime),
    toTime: toIso(story.toTime),
    latitude: story.latitude,
    longitude: story.longitude,
    address: story.address,
    city: story.city,
    region: story.region,
    countryId: story.countryId,
    metadata: story.metadata,
    internalNotes: story.internalNotes,
    tagIds: story.tags?.map(t => t.id) || [],
    categoryIds: story.categories?.map(c => c.id) || [],
    attachmentIds: story.attachments?.map(a => a.id) || [],
    mainImageId: story.mainImageId
  }
}

export function snapshotOfVersion(version: Partial<StoryVersion>): StorySnapshot {
  return {
    title: version.title,
    details: version.details,
    type: version.type,
    status: version.storyStatus,
    priority: version.priority,
    fromTime: toIso(version.fromTime),
    toTime: toIso(version.toTime),
    latitude: version.latitude,
    longitude: version.longitude,
    address: version.address,
    city: version.city,
    region: version.region,
    countryId: version.countryId,
    metadata: version.metadata,
    internalNotes: version.internalNotes,
    tagIds: version.tagIds || [],
    categoryIds: version.categoryIds || [],
    attachmentIds: version.attachmentIds || [],
    mainImageId: version.mainImageId
  }
}

/** The content to store on a version capturing `story` */
export function versionContentOfStory(story: Story): VersionContent {
  return {
    title: story.title,
    details: story.details ?? null,
    type: story.type,
    storyStatus: story.status,
    priority: story.priority,
    fromTime: toDate(story.fromTime),
    toTime: toDate(story.toTime),
    latitude: story.latitude ?? null,
    longitude: story.longitude ?? null,
    address: story.address ?? null,
    city: story.city ?? null,
    region: story.region ?? null,
    countryId: story.countryId ?? null,
    metadata: story.metadata as Record<string, unknown>,
    internalNotes: story.internalNotes ?? null,
    tagIds: story.tags?.map(t => t.id) || null,
    categoryIds: story.categories?.map(c => c.id) || null,
    attachmentIds: story.attachments?.map(a => a.id) || null,
    mainImageId: story.mainImageId ?? null
  }
}

/** Copies a version's content (for branches and rollbacks) */
export function versionContentOf(version: StoryVersion): VersionContent {
  return {
    title: version.title,
    details: version.details,
    type: version.type,
    storyStatus: version.storyStatus,
    priority: version.priority,
    fromTime: toDate(version.fromTime),
    toTime: toDate(version.toTime),
    latitude: version.latitude,
    longitude: version.longitude,
    address: version.address,
    city: version.city,
    region: version.region,
    countryId: version.countryId,
    metadata: version.metadata,
    internalNotes: version.internalNotes,
    tagIds: version.tagIds,
    categoryIds: version.categoryIds,
    attachmentIds: version.attachmentIds,
    mainImageId: version.mainImageId
  }
}

/**
 * Turns a (merged) snapshot back into version content. The snapshot's `status` is the
 * story status: it belongs in storyStatus, never in the version's own status.
 */
export function versionContentFromSnapshot(snapshot: StorySnapshot): Partial<StoryVersion> {
  const { status, fromTime, toTime, ...rest } = snapshot
  return {
    ...(rest as Partial<StoryVersion>),
    storyStatus: status as string,
    fromTime: toDate(fromTime as DateLike),
    toTime: toDate(toTime as DateLike)
  }
}

/**
 * The story fields a rollback restores: the content. Not the status, which belongs to the
 * editorial workflow (PATCH /stories/:id/status), nor the links or the main image.
 */
export function storyContentOfVersion(version: StoryVersion): Partial<Story> {
  return {
    title: version.title,
    details: version.details,
    type: version.type as StoryType,
    priority: version.priority as StoryPriority,
    fromTime: toDate(version.fromTime) ?? undefined,
    toTime: toDate(version.toTime) ?? undefined,
    latitude: version.latitude,
    longitude: version.longitude,
    address: version.address,
    city: version.city,
    region: version.region,
    countryId: version.countryId,
    metadata: version.metadata as Record<string, unknown>,
    internalNotes: version.internalNotes
  }
}

/** SHA-256 of the snapshot with sorted keys, for deduplication */
export function contentHash(snapshot: StorySnapshot): string {
  const sorted = Object.fromEntries(
    Object.keys(snapshot)
      .sort()
      .map(key => [key, snapshot[key]])
  )
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

export function diffSnapshots(from: StorySnapshot, to: StorySnapshot): VersionDiff {
  const added: Record<string, unknown> = {}
  const modified: Record<string, { old: unknown; new: unknown }> = {}
  const removed: Record<string, unknown> = {}

  for (const [key, newValue] of Object.entries(to)) {
    if (!(key in from)) {
      added[key] = newValue
    } else if (!isDeepEqual(from[key], newValue)) {
      modified[key] = { old: from[key], new: newValue }
    }
  }
  for (const [key, oldValue] of Object.entries(from)) {
    if (!(key in to)) {
      removed[key] = oldValue
    }
  }

  return { added, modified, removed }
}

export function changedFields(diff: VersionDiff): string[] {
  return [
    ...Object.keys(diff.added || {}),
    ...Object.keys(diff.modified || {}),
    ...Object.keys(diff.removed || {})
  ]
}

/** The diff as stored on a version: every changed field in one object */
export function flattenDiff(diff: VersionDiff): Record<string, unknown> {
  return { ...diff.added, ...diff.modified, ...diff.removed }
}

/** Human-readable change summary */
export function summarizeChanges(diff: VersionDiff): string {
  const changes: string[] = []
  const addedCount = Object.keys(diff.added || {}).length
  const modifiedFields = Object.keys(diff.modified || {})
  const removedCount = Object.keys(diff.removed || {}).length

  if (addedCount > 0) {
    changes.push(`${addedCount} field(s) added`)
  }
  if (modifiedFields.length > 0) {
    changes.push(
      modifiedFields.length <= 3
        ? `Modified: ${modifiedFields.join(', ')}`
        : `${modifiedFields.length} field(s) modified`
    )
  }
  if (removedCount > 0) {
    changes.push(`${removedCount} field(s) removed`)
  }

  return changes.join('; ') || 'No changes'
}

/** Fields both sides changed from the common base, to different values */
export function detectConflicts(
  base: StorySnapshot,
  source: StorySnapshot,
  target: StorySnapshot
): MergeConflict[] {
  const fields = new Set([...Object.keys(base), ...Object.keys(source), ...Object.keys(target)])
  const conflicts: MergeConflict[] = []

  for (const field of fields) {
    const [baseValue, sourceValue, targetValue] = [base[field], source[field], target[field]]
    const sourceChanged = !isDeepEqual(baseValue, sourceValue)
    const targetChanged = !isDeepEqual(baseValue, targetValue)
    if (sourceChanged && targetChanged && !isDeepEqual(sourceValue, targetValue)) {
      conflicts.push({ field, baseValue, sourceValue, targetValue })
    }
  }

  return conflicts
}

/**
 * Source content wins; explicit conflict resolutions override it. Resolutions come from
 * the request body, so only content fields are taken: anything else (id, createdBy,
 * status...) would be mass-assigned onto the new version row.
 */
export function mergeSnapshots(
  source: StorySnapshot,
  resolutions?: Record<string, unknown>
): StorySnapshot {
  const accepted = Object.entries(resolutions ?? {}).filter(([field]) => field in source)
  return { ...source, ...Object.fromEntries(accepted) }
}

export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => isDeepEqual(item, b[index]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object)
    const bKeys = Object.keys(b as object)
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(key =>
        isDeepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      )
    )
  }

  return false
}
