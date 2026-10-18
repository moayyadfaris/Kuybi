/**
 * Columns a story list may be sorted by. The value becomes an ORDER BY identifier
 * (which cannot be a bound parameter), so it must come from this list.
 */
export const STORY_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'status',
  'fromTime',
  'toTime'
] as const
export type StorySortField = (typeof STORY_SORT_FIELDS)[number]
