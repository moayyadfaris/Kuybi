/**
 * error.code over HTTP for the cases a client acts on: refresh an expired token, sign in
 * again after a revoked session, show bad credentials, fix validation errors, retry an
 * idempotent request later. Messages may change; these codes may not.
 */
import * as jwt from 'jsonwebtoken'

import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'

import { StoryFactory } from '../../factories/story.factory'
import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'
import { testConfig } from '../../test.config'

const TABLES = [
  'idempotency_keys',
  'story_versions',
  'stories',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]
const PASSWORD = 'Password123!' // createHttpTestApp's password for signed-up users

describe('Error codes', () => {
  let t: HttpTestApp
  let member: Actor

  const codeOf = (res: { body: { code?: string } }) => res.body.code

  beforeAll(async () => {
    t = await createHttpTestApp([AttachmentsModule, TagsModule, StoriesModule], {
      resetTables: TABLES
    })
    member = await t.signUp('member@error-codes.test', 'user')
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  describe('access tokens', () => {
    const me = () => t.http().get('/api/v1/sessions/me')

    it('AUTH_TOKEN_MISSING without a token', async () => {
      expect(codeOf(await me().expect(401))).toBe('AUTH_TOKEN_MISSING')
    })

    it('AUTH_TOKEN_EXPIRED for an expired token (refresh it)', async () => {
      const expired = jwt.sign(
        { sub: member.user.id, email: member.user.email, role: 'user', sid: 'x' },
        testConfig.auth.jwtSecret,
        { expiresIn: -60 }
      )
      const res = await me().set('Authorization', `Bearer ${expired}`).expect(401)
      expect(codeOf(res)).toBe('AUTH_TOKEN_EXPIRED')
    })

    it('AUTH_TOKEN_INVALID for a forged or malformed token', async () => {
      const forged = jwt.sign({ sub: member.user.id, sid: 'x' }, 'not-the-secret')
      expect(codeOf(await me().set('Authorization', `Bearer ${forged}`).expect(401))).toBe(
        'AUTH_TOKEN_INVALID'
      )
      expect(codeOf(await me().set('Authorization', 'Bearer garbage').expect(401))).toBe(
        'AUTH_TOKEN_INVALID'
      )
    })

    it('AUTH_SESSION_ENDED once the session is signed out (refreshing will not help)', async () => {
      const login = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: member.user.email, password: PASSWORD })
        .expect(201)
      const { accessToken, refreshToken } = login.body.data
      await t
        .http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(201)

      const res = await me().set('Authorization', `Bearer ${accessToken}`).expect(401)
      expect(codeOf(res)).toBe('AUTH_SESSION_ENDED')
    })
  })

  describe('sign-in', () => {
    it('AUTH_INVALID_CREDENTIALS for a wrong password or an unknown email', async () => {
      const wrong = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: member.user.email, password: 'Wrong-password-1' })
        .expect(401)
      const unknown = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@error-codes.test', password: 'Wrong-password-1' })
        .expect(401)
      expect([codeOf(wrong), codeOf(unknown)]).toEqual([
        'AUTH_INVALID_CREDENTIALS',
        'AUTH_INVALID_CREDENTIALS'
      ])
    })

    it('AUTH_REFRESH_TOKEN_INVALID for an unknown refresh token', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: '00000000-0000-4000-8000-000000000000.00000000-0000-4000-8000-000000000000'
        })
        .expect(401)
      expect(codeOf(res)).toBe('AUTH_REFRESH_TOKEN_INVALID')
    })
  })

  it('VALIDATION_FAILED with the list of problems, NOT_FOUND for a missing record', async () => {
    const invalid = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'x' })
      .expect(400)
    expect(codeOf(invalid)).toBe('VALIDATION_FAILED')
    expect(invalid.headers['content-type']).toContain('application/problem+json')
    expect(invalid.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pointer: '/email', field: 'email', code: 'IS_EMAIL' })
      ])
    )

    const missing = await t.http().get('/api/v1/stories/999999').set(member.auth).expect(404)
    expect(codeOf(missing)).toBe('NOT_FOUND')
  })

  it('IDEMPOTENCY_KEY_REUSED when a key is reused for a different request', async () => {
    const create = (title: string) =>
      t
        .http()
        .post('/api/v1/stories')
        .set(member.auth)
        .set('Idempotency-Key', 'error-codes-key-1')
        .send(StoryFactory.create({ title }))

    await create('First story').expect(201)
    const res = await create('A different story').expect(422)
    expect(codeOf(res)).toBe('IDEMPOTENCY_KEY_REUSED')
  })
})
