/**
 * Audit edge cases: the versioned route, malformed path values (400, not 500), result
 * caps on every list, an audit write that fails (the audited action still succeeds), and
 * request URLs stored without their query string (which can carry tokens).
 */
import { AuditModule } from '@modules/audit/audit.module'
import { AuditLogRepository } from '@modules/audit/database/audit-log.repository'
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
const PASSWORD = 'Password123!'

describe('Audit hardening', () => {
  let t: HttpTestApp
  let root: Actor
  let member: Actor

  const logs = () => t.dataSource.getRepository(AuditLog)
  const get = (path: string, query: Record<string, string | number> = {}) =>
    t.http().get(`/api/v1/audit${path}`).query(query).set(root.auth)

  beforeAll(async () => {
    t = await createHttpTestApp([AuditModule], { resetTables: TABLES })
    root = await t.signUp('root@audit-hardening.test', 'super-admin')
    member = await t.signUp('member@audit-hardening.test', 'user')
  })

  beforeEach(async () => {
    await t.dataSource.query('DELETE FROM audit_logs')
    await logs().save(
      Array.from({ length: 3 }, () => ({
        userId: member.user.id,
        action: AuditAction.ROLE_ASSIGN,
        severity: AuditSeverity.CRITICAL,
        status: AuditStatus.FAILURE,
        ipAddress: '203.0.113.9',
        requestId: 'req-many'
      })) as AuditLog[]
    )
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('answers 400 for a malformed user id or an unknown action', async () => {
    await get('/user/not-a-uuid/activity').expect(400)
    await get('/user/not-a-uuid/suspicious-activity').expect(400)
    await get('/action/not-an-action').expect(400)
  })

  it('caps every list', async () => {
    for (const path of [
      '/critical-events',
      '/failed-operations',
      `/ip/203.0.113.9`,
      '/request/req-many'
    ]) {
      const res = await get(path, { limit: 2 }).expect(200)
      expect(res.body.data).toHaveLength(2)
    }
  })

  it('stores request URLs without their query string', async () => {
    await t
      .http()
      .post('/api/v1/auth/login?token=secret-in-url')
      .send({ email: member.user.email, password: PASSWORD })
      .expect(201)

    const [login] = await logs().find({ where: { action: AuditAction.LOGIN } })
    expect(login.endpoint).toBe('/api/v1/auth/login')
    expect(JSON.stringify(login)).not.toContain('secret-in-url')
  })

  it('does not fail the audited action when the audit write fails', async () => {
    jest
      .spyOn(t.app.get(AuditLogRepository), 'append')
      .mockRejectedValueOnce(new Error('audit store down'))

    await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: member.user.email, password: PASSWORD })
      .expect(201)
  })
})
