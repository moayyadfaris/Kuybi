/**
 * A user's own sessions over HTTP: listing (filter, sort, paginate), reading one,
 * extending its expiry (persisted, bounded, owner only) and the validated query numbers
 * of extend and the super-admin cleanup.
 */
import { Session } from '@modules/auth/entities/session.entity'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = ['sessions', 'user_roles', 'role_permissions', 'users', 'roles', 'permissions']
const DAY = 24 * 60 * 60 * 1000

describe('Own sessions', () => {
  let t: HttpTestApp
  let owner: Actor
  let other: Actor
  let root: Actor

  const sessionsOf = (userId: string) =>
    t.dataSource.getRepository(Session).find({ where: { userId }, order: { createdAt: 'ASC' } })
  const expiryOf = async (id: string) =>
    (await t.dataSource.getRepository(Session).findOneByOrFail({ id })).expiresAt.getTime()

  beforeAll(async () => {
    t = await createHttpTestApp([], { resetTables: TABLES })
    owner = await t.signUp('owner@own-sessions.test', 'user')
    other = await t.signUp('other@own-sessions.test', 'user')
    root = await t.signUp('root@own-sessions.test', 'super-admin')
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  describe('listing', () => {
    beforeAll(async () => {
      // Two more sessions for the owner: one mobile, one tablet
      const [first] = await sessionsOf(owner.user.id)
      const repo = t.dataSource.getRepository(Session)
      for (const deviceType of ['mobile', 'tablet']) {
        await repo.save(
          repo.create({
            ...first,
            id: undefined,
            deviceType,
            refreshTokenHash: `hash-${deviceType}`,
            createdAt: undefined
          })
        )
      }
      await t.cache.reset()
    })

    it('filters by device and paginates', async () => {
      const all = await t.http().get('/api/v1/sessions/me').set(owner.auth).expect(200)
      expect(all.body.data.pagination).toMatchObject({ total: 3, page: 1, totalPages: 1 })

      const mobile = await t
        .http()
        .get('/api/v1/sessions')
        .query({ filterByDevice: 'mobile' })
        .set(owner.auth)
        .expect(200)
      expect(mobile.body.data.sessions.map((s: Session) => s.deviceType)).toEqual(['mobile'])

      const page2 = await t
        .http()
        .get('/api/v1/sessions/me')
        .query({ limit: 2, page: 2 })
        .set(owner.auth)
        .expect(200)
      expect(page2.body.data.sessions).toHaveLength(1)
      expect(page2.body.data.pagination).toMatchObject({ total: 3, totalPages: 2 })
    })

    it('sorts by the requested field', async () => {
      const res = await t
        .http()
        .get('/api/v1/sessions/me')
        .query({ sortBy: 'createdAt', sortOrder: 'asc' })
        .set(owner.auth)
        .expect(200)
      const created = res.body.data.sessions.map((s: Session) => new Date(s.createdAt).getTime())
      expect(created).toEqual([...created].sort((a, b) => a - b))
      expect(created[0]).toBeLessThan(created[created.length - 1])
    })

    it('applies the same filters for a super-admin listing another user', async () => {
      const res = await t
        .http()
        .get(`/api/v1/sessions/users/${owner.user.id}`)
        .query({ filterByDevice: 'tablet' })
        .set(root.auth)
        .expect(200)
      expect(res.body.data).toMatchObject({ userId: owner.user.id, total: 3, filtered: 1 })
    })
  })

  describe('status filter and privacy', () => {
    let viewer: Actor
    const HOUR = 60 * 60 * 1000

    beforeAll(async () => {
      viewer = await t.signUp('viewer@own-sessions.test', 'user')
      const [current] = await sessionsOf(viewer.user.id)
      const repo = t.dataSource.getRepository(Session)
      const copy = (fields: Partial<Session>) =>
        repo.save(
          repo.create({
            ...current,
            id: undefined,
            createdAt: undefined,
            refreshTokenHash: `hash-${Math.random()}`,
            ...fields
          })
        )
      await copy({ expiresAt: new Date(Date.now() + 2 * HOUR), deviceType: 'mobile' })
      await copy({ expiresAt: new Date(Date.now() - HOUR), deviceType: 'tablet' })
      await copy({ isActive: false, deletedAt: new Date(), deviceType: 'bot' })
      await t.cache.reset()
    })

    const list = async (query: Record<string, string>) =>
      (await t.http().get('/api/v1/sessions/me').query(query).set(viewer.auth).expect(200)).body
        .data.sessions as Array<Session & { status: string }>
    const devices = async (query: Record<string, string>) =>
      (await list(query)).map(s => s.deviceType).sort()

    it('lists live sessions by default and filters by status', async () => {
      expect(await devices({})).toEqual(['mobile', 'unknown'])
      expect(await devices({ filterByStatus: 'active' })).toEqual(['mobile', 'unknown'])
      expect(await devices({ filterByStatus: 'expiring' })).toEqual(['mobile'])
      expect(await devices({ filterByStatus: 'expired' })).toEqual(['tablet'])
      expect(await devices({ filterByStatus: 'revoked' })).toEqual(['bot'])
      expect(await devices({ filterByStatus: 'all' })).toHaveLength(4)
    })

    it('reports each session status', async () => {
      const all = await list({ filterByStatus: 'all' })
      const statusOf = (device: string) => all.find(s => s.deviceType === device)?.status
      expect(statusOf('mobile')).toBe('active')
      expect(statusOf('tablet')).toBe('expired')
      expect(statusOf('bot')).toBe('revoked')
    })

    it('masks IP addresses on request', async () => {
      await t.dataSource
        .getRepository(Session)
        .update({ userId: viewer.user.id }, { ipAddress: '203.0.113.77' })
      await t.cache.reset()

      const [masked] = await list({ anonymizeData: 'true' })
      expect(masked.ipAddress).toBe('203.0.***.***')
      const [plain] = await list({})
      expect(plain.ipAddress).toBe('203.0.113.77')
    })
  })

  it('has one session list: GET /v1/auth/sessions is gone', async () => {
    await t.http().get('/api/v1/auth/sessions').set(owner.auth).expect(404)
  })

  describe('one session', () => {
    it('reads its own session and refuses another user', async () => {
      const [mine] = await sessionsOf(owner.user.id)

      const res = await t.http().get(`/api/v1/sessions/${mine.id}`).set(owner.auth).expect(200)
      expect(res.body.data).toMatchObject({ id: mine.id, riskAssessment: expect.any(Object) })

      await t.http().get(`/api/v1/sessions/${mine.id}`).set(other.auth).expect(403)
    })
  })

  describe('extend', () => {
    it('stores the new expiry', async () => {
      const [mine] = await sessionsOf(owner.user.id)
      const before = await expiryOf(mine.id)

      const res = await t
        .http()
        .post(`/api/v1/sessions/${mine.id}/extend`)
        .query({ days: 3 })
        .set(owner.auth)
        .expect(200)

      expect(await expiryOf(mine.id)).toBe(before + 3 * DAY)
      expect(new Date(res.body.data.newExpiresAt).getTime()).toBe(before + 3 * DAY)
    })

    it('never sets the expiry more than 30 days ahead', async () => {
      const [mine] = await sessionsOf(owner.user.id)

      await t
        .http()
        .post(`/api/v1/sessions/${mine.id}/extend`)
        .query({ days: 30 })
        .set(owner.auth)
        .expect(200)

      expect(await expiryOf(mine.id)).toBeLessThanOrEqual(Date.now() + 30 * DAY)
    })

    it("refuses another user's session and leaves it unchanged", async () => {
      const [theirs] = await sessionsOf(other.user.id)
      const before = await expiryOf(theirs.id)

      await t
        .http()
        .post(`/api/v1/sessions/${theirs.id}/extend`)
        .query({ days: 3 })
        .set(owner.auth)
        .expect(403)

      expect(await expiryOf(theirs.id)).toBe(before)
    })

    it('rejects days that are not a whole number from 1 to 30', async () => {
      const [mine] = await sessionsOf(owner.user.id)
      for (const days of ['abc', '0', '31', '2.5']) {
        await t
          .http()
          .post(`/api/v1/sessions/${mine.id}/extend`)
          .query({ days })
          .set(owner.auth)
          .expect(400)
      }
    })
  })

  it('rejects a cleanup age that is not a whole number from 1 to 365', async () => {
    for (const olderThanDays of ['abc', '0', '366']) {
      await t
        .http()
        .post('/api/v1/sessions/cleanup')
        .query({ olderThanDays })
        .set(root.auth)
        .expect(400)
    }
  })
})
