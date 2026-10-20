/**
 * Password and token hashing over HTTP: new passwords that bcrypt would truncate are
 * refused, refresh tokens are stored as SHA-256 hashes, and refresh tokens of sessions
 * created before that (bcrypt hashes) keep working.
 */
import * as bcrypt from 'bcrypt'

import { Session } from '@modules/auth/entities/session.entity'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = ['sessions', 'user_roles', 'role_permissions', 'users', 'roles', 'permissions']
const PASSWORD = 'Password123!' // createHttpTestApp's password for signed-up users

describe('Password and token hashing', () => {
  let t: HttpTestApp
  let member: Actor

  const login = async () =>
    (
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: member.user.email, password: PASSWORD })
        .expect(201)
    ).body.data as { accessToken: string; refreshToken: string }
  const refresh = (refreshToken: string) =>
    t.http().post('/api/v1/auth/refresh').send({ refreshToken })

  beforeAll(async () => {
    t = await createHttpTestApp([], { resetTables: TABLES })
    member = await t.signUp('member@password-hashing.test', 'user')
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('refuses a new password longer than 72 bytes', async () => {
    // 66 ASCII characters + 4 accented letters (2 bytes each) = 74 bytes, 70 characters
    const tooLong = `Aa1@${'x'.repeat(62)}éééé`
    const res = await t
      .http()
      .post('/api/v1/auth/change-password')
      .set(member.auth)
      .send({ currentPassword: PASSWORD, newPassword: tooLong, confirmPassword: tooLong })
      .expect(400)
    expect(JSON.stringify(res.body)).toContain('72 bytes')
  })

  it('stores refresh tokens as SHA-256 hashes and accepts them', async () => {
    const { refreshToken } = await login()
    const [tokenId] = refreshToken.split('.')

    const session = await t.dataSource.getRepository(Session).findOneByOrFail({ id: tokenId })
    expect(session.refreshTokenHash).toMatch(/^sha256\$[0-9a-f]{64}$/)

    await refresh(refreshToken).expect(201)
  })

  it('rotates a refresh token once: of two concurrent refreshes only one succeeds', async () => {
    const { refreshToken } = await login()

    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)])

    expect(results.map(r => r.status).sort()).toEqual([201, 401])
  })

  it('still accepts a refresh token whose session stored a bcrypt hash', async () => {
    const { refreshToken } = await login()
    const [tokenId, secret] = refreshToken.split('.')
    await t.dataSource
      .getRepository(Session)
      .update(tokenId, { refreshTokenHash: await bcrypt.hash(secret, 4) })
    await t.cache.reset()

    await refresh(refreshToken).expect(201)
    await refresh(`${tokenId}.00000000-0000-4000-8000-000000000000`).expect(401)
  })
})
