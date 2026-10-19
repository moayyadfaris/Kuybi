/**
 * Audit log queries over HTTP (super-admin only): search filters and pagination,
 * statistics, critical and failed events, per-user, per-entity, per-action, per-IP and
 * per-request lookups, suspicious-activity detection.
 */
import { AuditModule } from '@modules/audit/audit.module'
import {
  AuditAction,
  AuditLog,
  AuditSeverity,
  AuditStatus
} from '@modules/audit/entities/audit-log.entity'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'audit_logs',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Audit queries', () => {
  let t: HttpTestApp
  let root: Actor
  let member: Actor
  let subjectId: string

  const seed = (rows: Array<Partial<AuditLog>>) =>
    t.dataSource.getRepository(AuditLog).save(
      rows.map(row => ({
        status: AuditStatus.SUCCESS,
        severity: AuditSeverity.LOW,
        ...row
      })) as AuditLog[]
    )
  const get = (path: string, query: Record<string, string | number | string[]> = {}) =>
    t.http().get(`/api/audit${path}`).query(query).set(root.auth)

  beforeAll(async () => {
    t = await createHttpTestApp([AuditModule], { resetTables: TABLES })
    root = await t.signUp('root@audit-query.test', 'super-admin')
    member = await t.signUp('member@audit-query.test', 'user')
    // audit_logs.userId references users (ON DELETE SET NULL keeps the history)
    subjectId = member.user.id
  })

  beforeEach(async () => {
    await t.dataSource.query('DELETE FROM audit_logs')
    await seed([
      {
        userId: subjectId,
        action: AuditAction.LOGIN,
        ipAddress: '203.0.113.7',
        requestId: 'req-1'
      },
      {
        userId: subjectId,
        action: AuditAction.LOGIN,
        status: AuditStatus.FAILURE,
        severity: AuditSeverity.HIGH,
        ipAddress: '203.0.113.7'
      },
      {
        userId: subjectId,
        action: AuditAction.UPDATE,
        entityType: 'Story',
        entityId: '42',
        severity: AuditSeverity.MEDIUM
      },
      {
        userId: root.user.id,
        action: AuditAction.ROLE_ASSIGN,
        entityType: 'UserRole',
        entityId: '7',
        severity: AuditSeverity.CRITICAL,
        ipAddress: '198.51.100.1'
      }
    ])
    await t.cache.reset()
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('is for super-admins only', async () => {
    await t.http().get('/api/audit/search').set(member.auth).expect(403)
    await t.http().get('/api/audit/search').expect(401)
  })

  describe('search', () => {
    it('filters by user, single or several actions, severity and status', async () => {
      const byUser = await get('/search', { userId: subjectId }).expect(200)
      expect(byUser.body.data.total).toBe(3)

      // A single value in the query string is not an array: it must still filter
      const oneAction = await get('/search', { action: AuditAction.LOGIN }).expect(200)
      expect(oneAction.body.data.total).toBe(2) // the successful and the failed login
      expect(new Set(oneAction.body.data.logs.map((l: AuditLog) => l.action))).toEqual(
        new Set([AuditAction.LOGIN])
      )

      const twoActions = await get('/search', {
        action: [AuditAction.UPDATE, AuditAction.ROLE_ASSIGN]
      }).expect(200)
      expect(twoActions.body.data.total).toBe(2)

      const failures = await get('/search', { status: AuditStatus.FAILURE }).expect(200)
      expect(failures.body.data.logs.map((l: AuditLog) => l.action)).toEqual([AuditAction.LOGIN])

      const severe = await get('/search', { severity: AuditSeverity.CRITICAL }).expect(200)
      expect(severe.body.data.total).toBe(1)
    })

    it('filters by entity and IP address, and paginates', async () => {
      const entity = await get('/search', { entityType: 'Story', entityId: '42' }).expect(200)
      expect(entity.body.data.total).toBe(1)

      const ip = await get('/search', { ipAddress: '203.0.113.7' }).expect(200)
      expect(ip.body.data.total).toBe(2)

      const page = await get('/search', { limit: 2, page: 1 }).expect(200)
      expect(page.body.data.logs).toHaveLength(2)
      expect(page.body.data.total).toBe(4)
    })

    it('rejects unknown enum values', async () => {
      await get('/search', { action: 'not-an-action' }).expect(400)
    })
  })

  it('counts by action, severity and status', async () => {
    const res = await get('/statistics').expect(200)

    expect(res.body.data).toMatchObject({ total: 4, criticalCount: 2, failedCount: 1 })
  })

  it('lists critical events and failed operations', async () => {
    const critical = await get('/critical-events').expect(200)
    expect(critical.body.data.map((l: AuditLog) => l.severity).sort()).toEqual([
      AuditSeverity.CRITICAL,
      AuditSeverity.HIGH
    ])

    const failed = await get('/failed-operations').expect(200)
    expect(failed.body.data.map((l: AuditLog) => l.action)).toEqual([AuditAction.LOGIN])
  })

  it('answers per user, entity, action, IP and request', async () => {
    const activity = await get(`/user/${subjectId}/activity`).expect(200)
    expect(JSON.stringify(activity.body.data)).toContain(AuditAction.UPDATE)

    const history = await get('/entity/Story/42/history').expect(200)
    expect(history.body.data).toMatchObject({
      entityType: 'Story',
      entityId: '42',
      totalChanges: 1
    })

    const byAction = await get(`/action/${AuditAction.ROLE_ASSIGN}`).expect(200)
    expect(byAction.body.data).toHaveLength(1)

    const byIp = await get('/ip/198.51.100.1').expect(200)
    expect(byIp.body.data).toHaveLength(1)

    const byRequest = await get('/request/req-1').expect(200)
    expect(byRequest.body.data).toHaveLength(1)
  })

  it('reads one log by id, 404 when missing, 400 when not a UUID', async () => {
    const [log] = await t.dataSource.getRepository(AuditLog).find({ take: 1 })

    await get(`/${log.id}`).expect(200)
    await get('/00000000-0000-4000-8000-000000000000').expect(404)
    await get('/not-a-uuid').expect(400)
  })

  it('flags repeated failed logins as suspicious', async () => {
    await seed(
      Array.from({ length: 6 }, () => ({
        userId: subjectId,
        action: AuditAction.LOGIN,
        status: AuditStatus.FAILURE,
        ipAddress: '203.0.113.9'
      }))
    )

    const res = await get(`/user/${subjectId}/suspicious-activity`, {
      timeWindowMinutes: 60
    }).expect(200)

    expect(res.body.data.isSuspicious).toBe(true)
    expect(res.body.data.reasons.join(' ')).toContain('failed login')
  })
})
