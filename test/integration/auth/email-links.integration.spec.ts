/**
 * Emailed links point at the public site (app.publicUrl, APP_PUBLIC_URL), never at a
 * hard-coded localhost: users open them from their mailbox.
 */
import { createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'
import { testConfig } from '../../test.config'

const TABLES = [
  'outbox_messages',
  'email_verifications',
  'password_resets',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]
const EMAIL = 'links@email-links.test'

describe('Emailed links', () => {
  let t: HttpTestApp

  const latestPayload = async () => {
    const [message] = await t.dataSource.query(
      `SELECT payload FROM outbox_messages WHERE payload->>'to' = $1
        ORDER BY "createdAt" DESC LIMIT 1`,
      [EMAIL]
    )
    return message.payload
  }

  beforeAll(async () => {
    t = await createHttpTestApp([], { resetTables: TABLES })
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('sends verification and reset links to the public site', async () => {
    await t
      .http()
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: 'Password123!', firstName: 'Link', lastName: 'Test' })
      .expect(201)
    expect((await latestPayload()).verificationLink).toMatch(
      new RegExp(`^${testConfig.app.publicUrl}/verify-email\\?token=`)
    )

    await t.http().post('/api/v1/auth/forgot-password').send({ email: EMAIL })
    expect((await latestPayload()).resetLink).toMatch(
      new RegExp(`^${testConfig.app.publicUrl}/reset-password\\?token=`)
    )
  })
})
