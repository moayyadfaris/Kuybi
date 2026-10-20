/**
 * Sign-up over HTTP: accounts without a phone number, the emailed verification link (a
 * frontend page, single use, token stored hashed), and resending that does not reveal
 * whether an email is registered.
 */
import { EmailVerification } from '@modules/users/entities/email-verification.entity'
import { User } from '@modules/users/entities/user.entity'

import { hashTokenSecret } from '@core/security'

import { createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'outbox_messages',
  'email_verifications',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]
const PASSWORD = 'Strong@Pass123'

describe('Registration', () => {
  let t: HttpTestApp

  const register = (email: string, extra: Record<string, string> = {}) =>
    t
      .http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, firstName: 'Anna', lastName: 'Bell', ...extra })
  /** The link from the newest email queued for this address, as the user would get it */
  const emailedLink = async (email: string) => {
    const [message] = await t.dataSource.query(
      `SELECT payload FROM outbox_messages WHERE payload->>'to' = $1
        ORDER BY "createdAt" DESC LIMIT 1`,
      [email]
    )
    return new URL(message.payload.verificationLink)
  }

  beforeAll(async () => {
    t = await createHttpTestApp([], { resetTables: TABLES })
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('registers any number of users without a phone number', async () => {
    await register('nophone-1@registration.test').expect(201)
    await register('nophone-2@registration.test').expect(201)

    const users = await t.dataSource.getRepository(User).find({
      where: [{ email: 'nophone-1@registration.test' }, { email: 'nophone-2@registration.test' }]
    })
    expect(users.map(u => u.mobileNumber)).toEqual([null, null])
  })

  it('verifies the email once through the emailed link', async () => {
    const email = 'verify@registration.test'
    await register(email).expect(201)

    const link = await emailedLink(email)
    // A frontend page that posts the token: the API has no GET /verify-email
    expect(link.pathname).toBe('/verify-email')
    const token = link.searchParams.get('token') as string

    const stored = await t.dataSource.getRepository(EmailVerification).findOneByOrFail({ email })
    expect(stored.token).toBe(hashTokenSecret(token))

    await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(201)
    const user = await t.dataSource.getRepository(User).findOneByOrFail({ email })
    expect(user.isEmailVerified).toBe(true)

    await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(400)
  })

  it('answers a resend the same way for unknown, verified and pending emails', async () => {
    const pending = 'pending@registration.test'
    await register(pending).expect(201)

    const answers = await Promise.all(
      [pending, 'nobody@registration.test', 'verify@registration.test'].map(email =>
        t.http().post('/api/v1/auth/resend-verification').send({ email })
      )
    )
    expect(answers.map(a => a.status)).toEqual([201, 201, 201])
    expect(new Set(answers.map(a => a.body.data.message)).size).toBe(1)
  })
})
