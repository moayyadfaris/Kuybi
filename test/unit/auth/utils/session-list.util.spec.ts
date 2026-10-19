import { SessionFilterDto } from '@modules/auth/dto'
import { Session } from '@modules/auth/entities/session.entity'
import {
  anonymizeIp,
  filterAndSortSessions,
  needsEndedSessions,
  sessionState,
  shareOf
} from '@modules/auth/utils/session-list.util'

const session = (fields: Partial<Session>) => fields as Session

describe('session list helpers', () => {
  describe('filterAndSortSessions', () => {
    const sessions = [
      session({ id: 'a', deviceType: 'mobile', ipAddress: '10.0.0.1', createdAt: new Date(1) }),
      session({ id: 'b', deviceType: 'desktop', ipAddress: '10.0.0.2', createdAt: new Date(3) }),
      session({ id: 'c', deviceType: 'Mobile', createdAt: new Date(2) })
    ]
    const ids = (filter: Record<string, string>) =>
      filterAndSortSessions([...sessions], filter as unknown as SessionFilterDto).map(s => s.id)

    it('sorts newest first by default, ascending on request', () => {
      expect(ids({})).toEqual(['b', 'c', 'a'])
      expect(ids({ sortOrder: 'asc' })).toEqual(['a', 'c', 'b'])
    })

    it('matches the device case-insensitively and IPs by substring', () => {
      expect(ids({ filterByDevice: 'MOBILE' })).toEqual(['c', 'a'])
      expect(ids({ searchByIp: '0.0.2' })).toEqual(['b'])
    })

    it('sorts missing values last in either direction', () => {
      const byIp = (sortOrder: string) => ids({ sortBy: 'ipAddress', sortOrder })
      expect(byIp('asc').at(-1)).toBe('c')
      expect(byIp('desc').at(-1)).toBe('c')
    })
  })

  describe('shareOf', () => {
    it('reports each count as a percentage of the total', () => {
      expect(shareOf('deviceType', { mobile: 1, desktop: 3 }, 4)).toEqual([
        { deviceType: 'mobile', count: 1, percentage: 25 },
        { deviceType: 'desktop', count: 3, percentage: 75 }
      ])
    })

    it('reports 0%, not NaN, when there is nothing to count', () => {
      expect(shareOf('deviceType', { mobile: 0 }, 0)).toEqual([
        { deviceType: 'mobile', count: 0, percentage: 0 }
      ])
    })
  })

  describe('session state', () => {
    const later = new Date(Date.now() + 60_000)
    it('is revoked before it is expired', () => {
      expect(sessionState(session({ isActive: true, expiresAt: later }))).toBe('active')
      expect(sessionState(session({ isActive: true, expiresAt: new Date(0) }))).toBe('expired')
      expect(sessionState(session({ isActive: false, expiresAt: new Date(0) }))).toBe('revoked')
      expect(
        sessionState(session({ isActive: true, deletedAt: new Date(), expiresAt: later }))
      ).toBe('revoked')
    })

    it('loads ended sessions only when the filter can match them', () => {
      const needs = (filter: Record<string, unknown>) =>
        needsEndedSessions(filter as unknown as SessionFilterDto)
      expect(needs({})).toBe(false)
      expect(needs({ includeExpired: true })).toBe(true)
      expect(needs({ filterByStatus: 'expiring', includeExpired: true })).toBe(false)
      expect(needs({ filterByStatus: 'revoked' })).toBe(true)
    })
  })

  it('masks the end of IPv4 and IPv6 addresses', () => {
    expect(anonymizeIp('203.0.113.7')).toBe('203.0.***.***')
    expect(anonymizeIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3:8d3::')
    expect(anonymizeIp(undefined)).toBeUndefined()
  })
})
