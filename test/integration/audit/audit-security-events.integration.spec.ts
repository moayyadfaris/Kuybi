/**
 * Security events in the audit trail: failed logins (with the account when it exists, so
 * the repeated-failures rule of the suspicious-activity check can fire), requests refused
 * by AbilityGuard, and timestamps stored with their time zone.
 */
import { AuditModule } from '@modules/audit/audit.module'
import { AuditAction, AuditLog, AuditStatus } from '@modules/audit/entities/audit-log.entity'

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

describe('Audit security events', () => {
  let t: HttpTestApp
  let root: Actor
  let member: Actor

  const logs = () => t.dataSource.getRepository(AuditLog)
  const failedLogins = () =>
    logs().find({
      where: { action: AuditAction.LOGIN, status: AuditStatus.FAILURE },
      order: { createdAt: 'ASC' }
    })
  const login = (email: string, password: string) =>
    t.http().post('/api/v1/auth/login').send({ email, password })

  beforeAll(async () => {
    t = await createHttpTestApp([AuditModule], { resetTables: TABLES })
    root = await t.signUp('root@audit-security.test', 'super-admin')
  })

  beforeEach(async () => {
    // A fresh member each time: five failures lock the account
    await t.dataSource.query(`DELETE FROM users WHERE email = 'member@audit-security.test'`)
    member = await t.signUp('member@audit-security.test', 'user')
    await t.dataSource.query('DELETE FROM audit_logs')
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('records a wrong password against the account', async () => {
    await login(member.user.email, 'Wrong-password-1!').expect(401)

    const [failure] = await failedLogins()
    expect(failure).toMatchObject({
      userId: member.user.id,
      email: member.user.email,
      endpoint: '/api/v1/auth/login',
      metadata: expect.objectContaining({ reason: 'invalid_password' })
    })
    expect(JSON.stringify(failure)).not.toContain('Wrong-password-1!')
  })

  it('records an unknown email without storing what was typed', async () => {
    await login('nobody@audit-security.test', 'Wrong-password-1!').expect(401)

    const [failure] = await failedLogins()
    expect(failure.userId).toBeNull()
    expect(failure.metadata).toMatchObject({ reason: 'user_not_found' })
    expect(JSON.stringify(failure)).not.toContain('nobody@audit-security.test')
  })

  it('flags repeated failed logins as suspicious', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await login(member.user.email, 'Wrong-password-1!')
    }
    // The account is locked now; a locked attempt is a failure too
    await login(member.user.email, 'Wrong-password-1!').expect(423)
    expect(await failedLogins()).toHaveLength(6)

    const res = await t
      .http()
      .get(`/api/v1/audit/user/${member.user.id}/suspicious-activity`)
      .set(root.auth)
      .expect(200)
    expect(res.body.data.isSuspicious).toBe(true)
    expect(res.body.data.reasons.join(' ')).toContain('failed login attempts')
  })

  it('records a request refused for missing permissions', async () => {
    await t.http().get('/api/v1/audit/statistics').set(member.auth).expect(403)

    const [denied] = await logs().find({ where: { action: AuditAction.UNAUTHORIZED_ACCESS } })
    expect(denied).toMatchObject({
      userId: member.user.id,
      status: AuditStatus.FAILURE,
      method: 'GET',
      endpoint: '/api/v1/audit/statistics'
    })
  })

  it('stores timestamps with their time zone', async () => {
    // A session in another zone than the app's: without a zone, now() would be stored as
    // that zone's wall clock and read back hours off
    await t.dataSource.transaction(async manager => {
      await manager.query(`SET LOCAL TIME ZONE 'Pacific/Kiritimati'`)
      await manager.query(`INSERT INTO audit_logs (action) VALUES ('login')`)
    })
    const [row] = await logs().find()
    expect(Math.abs(row.createdAt.getTime() - Date.now())).toBeLessThan(60_000)

    const zoneless = await t.dataSource.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`
    )
    expect(zoneless).toEqual([])
  })
})
