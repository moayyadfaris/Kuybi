import { SessionFilterDto } from '../dto'
import { Session } from '../entities/session.entity'

/** Sort helper: missing values sort last regardless of direction */
function compareForSort(a: unknown, b: unknown, order: string): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  const result = (a as number | string | Date) > (b as number | string | Date) ? 1 : -1
  return order === 'asc' ? result : -result
}

const sameText = (value: string | undefined, wanted: string) =>
  value?.toLowerCase() === wanted.toLowerCase()

/** Applies the filters and sort order of a session listing (no pagination) */
export function filterAndSortSessions(sessions: Session[], filter: SessionFilterDto): Session[] {
  const { filterByDevice, filterByType, filterBySecurityLevel, searchByIp, searchByFingerprint } =
    filter

  const filtered = sessions.filter(
    s =>
      (!filterByDevice || sameText(s.deviceType, filterByDevice)) &&
      (!filterByType || sameText(s.sessionType, filterByType)) &&
      (!filterBySecurityLevel || s.securityLevel === filterBySecurityLevel) &&
      (!searchByIp || !!s.ipAddress?.includes(searchByIp)) &&
      (!searchByFingerprint || !!s.fingerprint?.includes(searchByFingerprint))
  )

  const sortBy = (filter.sortBy || 'createdAt') as keyof Session
  const sortOrder = filter.sortOrder || 'desc'
  return filtered.sort((a, b) => compareForSort(a[sortBy], b[sortBy], sortOrder))
}

type Share<K extends string> = Record<K, string> & { count: number; percentage: number }

/** Counts as `{ <key>, count, percentage }` rows (0% when there is nothing to count) */
export function shareOf<K extends string>(
  key: K,
  counts: Record<string, number>,
  total: number
): Share<K>[] {
  return Object.entries(counts).map(
    ([value, count]) =>
      ({ [key]: value, count, percentage: total ? (count / total) * 100 : 0 }) as Share<K>
  )
}
