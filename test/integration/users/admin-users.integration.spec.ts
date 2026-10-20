/**
 * Super-admin user administration over HTTP: locking or deactivating ends the user's
 * sessions at once, emails are stored lowercased (login matches them lowercased), and
 * password resets are audited.
 */
import { AuditModule } from '@modules/audit/audit.module'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'
import { User } from '@modules/users/entities/user.entity'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'audit_logs',
  'outbox_messages',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]
const PASSWORD = 'Password123!' // createHttpTestApp's password for signed-up users

describe('Admin user administration', () => {
  let t: HttpTestApp
  let root: Actor

  const patch = (userId: string, body: Record<string, unknown>) =>
    t.http().patch(`/api/v1/admin/users/${userId}`).set(root.auth).send(body).expect(200)
  const me = (as: Actor) => t.http().get('/api/v1/users/me').set(as.auth)

  beforeAll(async () => {
    t = await createHttpTestApp([AuditModule], { resetTables: TABLES })
    root = await t.signUp('root@admin-users.test', 'super-admin')
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('ends the sessions of a user it locks, and of one it deactivates', async () => {
    const locked = await t.signUp('locked@admin-users.test', 'user')
    const deactivated = await t.signUp('deactivated@admin-users.test', 'user')
    await me(locked).expect(200)

    await patch(locked.user.id, { isLocked: true, reason: 'compromised' })
    await patch(deactivated.user.id, { isActive: false })

    expect((await me(locked).expect(401)).body.error.code).toBe('AUTH_SESSION_ENDED')
    await me(deactivated).expect(401)
  })

  it('stores an email it sets lowercased, so the user can still log in', async () => {
    const member = await t.signUp('renamed@admin-users.test', 'user')

    await patch(member.user.id, { email: 'New.Address@Admin-Users.TEST' })

    const stored = await t.dataSource.getRepository(User).findOneByOrFail({ id: member.user.id })
    expect(stored.email).toBe('new.address@admin-users.test')
    await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'New.Address@admin-users.test', password: PASSWORD })
      .expect(201)
  })

  it('audits a password reset', async () => {
    const member = await t.signUp('reset@admin-users.test', 'user')

    const res = await t
      .http()
      .post('/api/v1/admin/users/reset-password')
      .set(root.auth)
      .send({ userId: member.user.id, reason: 'support ticket 42' })
      .expect(200)
    expect(res.body.data.temporaryPassword).toMatch(/^.{12}$/)

    const audit = await t.dataSource
      .getRepository(AuditLog)
      .findOneByOrFail({ entityType: 'User', entityId: member.user.id })
    expect(audit).toMatchObject({ action: 'reset_password', userId: root.user.id })
  })
})
