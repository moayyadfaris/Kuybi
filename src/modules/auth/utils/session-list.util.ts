import { SessionFilterDto, SessionStatus } from '../dto'
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

const EXPIRING_WITHIN_MS = 24 * 60 * 60 * 1000

export type SessionState = 'active' | 'expired' | 'revoked'

export function sessionState(session: Session, now = Date.now()): SessionState {
  if (!session.isActive || session.deletedAt) return 'revoked'
  return new Date(session.expiresAt).getTime() <= now ? 'expired' : 'active'
}

function matchesStatus(session: Session, status: SessionStatus | undefined, now: number) {
  if (!status || status === SessionStatus.ALL) return true
  const state = sessionState(session, now)
  if (status === SessionStatus.EXPIRING) {
    return state === 'active' && new Date(session.expiresAt).getTime() - now <= EXPIRING_WITHIN_MS
  }
  return state === status
}

/** Whether the listing needs ended (expired or revoked) sessions loaded */
export function needsEndedSessions(filter: SessionFilterDto): boolean {
  const status = filter.filterByStatus
  if (status) return status !== SessionStatus.ACTIVE && status !== SessionStatus.EXPIRING
  return !!filter.includeExpired
}

/** Applies the filters and sort order of a session listing (no pagination) */
export function filterAndSortSessions(sessions: Session[], filter: SessionFilterDto): Session[] {
  const { filterByDevice, filterByType, filterBySecurityLevel, searchByIp, searchByFingerprint } =
    filter

  const now = Date.now()
  const filtered = sessions.filter(
    s =>
      matchesStatus(s, filter.filterByStatus, now) &&
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

/** IPv4 keeps its first two parts, IPv6 its first four groups */
export function anonymizeIp(ip?: string | null): string | null | undefined {
  if (!ip) return ip
  if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}::`
  const parts = ip.split('.')
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.***.***` : ip
}

/** A session as listed: its state, and the IP masked when asked */
export function toListedSession(session: Session, filter: SessionFilterDto) {
  return {
    ...session,
    ipAddress: filter.anonymizeData ? anonymizeIp(session.ipAddress) : session.ipAddress,
    status: sessionState(session)
  }
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
