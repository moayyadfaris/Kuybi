import { SessionFilterDto } from '@modules/auth/dto'
import { Session } from '@modules/auth/entities/session.entity'
import { filterAndSortSessions, shareOf } from '@modules/auth/utils/session-list.util'

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
})
