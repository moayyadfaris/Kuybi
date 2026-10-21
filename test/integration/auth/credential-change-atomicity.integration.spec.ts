/**
 * A password change is all or nothing: the new password, the token claim, the password
 * history and the end of the old sessions commit together. If any step fails, the old
 * password still works, a reset link can be used again, and nothing is half-done (before,
 * the new password committed first and a failure left the old sessions valid).
 */
import { PasswordHistoryRepository } from '@modules/auth/repositories/password-history.repository'
import { SessionRepository } from '@modules/auth/repositories/session.repository'
import { SessionsService } from '@modules/auth/services/sessions.service'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'outbox_messages',
  'password_history',
  'password_resets',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]
const PASSWORD = 'Password123!'
const NEW_PASSWORD = 'Brand-New-Pass-42!'

describe('Credential changes are atomic', () => {
  let t: HttpTestApp
  let member: Actor

  const login = (password: string) =>
    t.http().post('/api/v1/auth/login').send({ email: member.user.email, password })
  const refresh = (refreshToken: string) =>
    t.http().post('/api/v1/auth/refresh').send({ refreshToken })

  beforeAll(async () => {
    t = await createHttpTestApp([], { resetTables: TABLES })
  })

  beforeEach(async () => {
    jest.restoreAllMocks()
    await t.dataSource.query(`DELETE FROM users WHERE email LIKE '%@credential-atomicity.test'`)
    member = await t.signUp(`member-${Date.now()}@credential-atomicity.test`, 'user')
  })

  afterAll(async () => {
    jest.restoreAllMocks()
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('rolls a password reset back when a later step fails, and lets the link be used again', async () => {
    const { refreshToken } = (await login(PASSWORD).expect(201)).body.data
    await t.http().post('/api/v1/auth/forgot-password').send({ email: member.user.email })
    const [message] = await t.dataSource.query(
      `SELECT payload FROM outbox_messages WHERE payload->>'to' = $1
        ORDER BY "createdAt" DESC LIMIT 1`,
      [member.user.email]
    )
    const token = new URL(message.payload.resetLink).searchParams.get('token')

    jest
      .spyOn(t.app.get(PasswordHistoryRepository), 'addPasswordHistory')
      .mockRejectedValueOnce(new Error('history store down'))
    const failed = await t
      .http()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: NEW_PASSWORD })
    expect(failed.status).toBeGreaterThanOrEqual(500)
    await login(PASSWORD).expect(201)

    await t
      .http()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: NEW_PASSWORD })
      .expect(201)
    await login(NEW_PASSWORD).expect(201)
    await refresh(refreshToken).expect(401)
  })

  it('rolls a password change back when ending the other sessions fails', async () => {
    jest
      .spyOn(t.app.get(SessionRepository), 'revokeAllUserSessions')
      .mockRejectedValueOnce(new Error('sessions store down'))

    const failed = await t
      .http()
      .post('/api/v1/auth/change-password')
      .set(member.auth)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })
    expect(failed.status).toBeGreaterThanOrEqual(500)
    await login(PASSWORD).expect(201)
  })

  it("rolls an admin's password set back when ending the user's sessions fails", async () => {
    const root = await t.signUp(`root-${Date.now()}@credential-atomicity.test`, 'super-admin')
    jest
      .spyOn(t.app.get(SessionsService), 'revokeAllSessions')
      .mockRejectedValueOnce(new Error('sessions store down'))

    const failed = await t
      .http()
      .post('/api/v1/admin/users/set-password')
      .set(root.auth)
      .send({ userId: member.user.id, newPassword: NEW_PASSWORD })
    expect(failed.status).toBeGreaterThanOrEqual(500)
    await login(PASSWORD).expect(201)
  })

  it("ends access from before an admin's password reset even if revoking sessions did not run", async () => {
    const root = await t.signUp(`root2-${Date.now()}@credential-atomicity.test`, 'super-admin')
    const { accessToken, refreshToken } = (await login(PASSWORD).expect(201)).body.data
    // The revocation runs in another module's listener: here it does nothing at all
    jest.spyOn(t.app.get(SessionsService), 'revokeAllSessions').mockResolvedValue(0)

    // No waiting: a token from the same second as the change must fail too (A06; the old
    // whole-second iat comparison accepted it)
    await t
      .http()
      .post('/api/v1/admin/users/set-password')
      .set(root.auth)
      .send({ userId: member.user.id, newPassword: NEW_PASSWORD })
      .expect(200)

    await t.http().get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`).expect(401)
    await refresh(refreshToken).expect(401)
    await login(NEW_PASSWORD).expect(201)
  })
})
