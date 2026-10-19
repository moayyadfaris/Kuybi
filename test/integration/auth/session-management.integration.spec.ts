/**
 * Session Management Integration Tests
 * Tests super-admin session management endpoints with real database
 */

import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { configureApp } from '@app/app.setup'
import { ENTITIES } from '@app/database/entities'
import { LoggerModule } from 'nestjs-pino'
import request from 'supertest'
import { DataSource } from 'typeorm'

import { AclModule } from '@modules/acl/acl.module'
import { Role } from '@modules/acl/entities/role.entity'
import { AuthModule } from '@modules/auth/auth.module'
import { Session } from '@modules/auth/entities/session.entity'
import { User } from '@modules/users/entities/user.entity'
import { AdminPasswordManagementService } from '@modules/users/services/admin-password-management.service'
import { UsersModule } from '@modules/users/users.module'

import { CacheService } from '@core/cache/services/cache.service'
import configuration from '@core/config/configuration'
import { EventsModule } from '@core/events'
import { SentryModule } from '@core/sentry'

import { UserFactory } from '../../factories/user.factory'
import { InMemoryCacheService } from '../../helpers/in-memory-cache.service'
import { testConfig } from '../../test.config'

describe('Session Management Integration Tests', () => {
  let app: INestApplication
  let dataSource: DataSource
  let superAdminUser: User
  let superAdminToken: string
  let adminUser: User
  let adminToken: string
  let regularUser: User
  let regularUserToken: string
  let cacheStub: InMemoryCacheService

  const SUPER_ADMIN_PASSWORD = 'SuperAdmin@123'
  const ADMIN_PASSWORD = 'Admin@123'
  const USER_PASSWORD = 'User@123'

  beforeAll(async () => {
    cacheStub = new InMemoryCacheService()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        EventsModule,
        SentryModule.forRoot(),
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration]
        }),
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'silent'
          }
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: testConfig.database.host,
          port: testConfig.database.port,
          username: testConfig.database.username,
          password: testConfig.database.password,
          database: testConfig.database.database,
          entities: ENTITIES,
          synchronize: false,
          dropSchema: false,
          logging: false
        }),
        AuthModule,
        UsersModule,
        AclModule
      ]
    })
      .overrideProvider(CacheService)
      .useValue(cacheStub)
      .compile()

    app = moduleFixture.createNestApplication()
    configureApp(app)
    await app.init()

    dataSource = moduleFixture.get(DataSource)

    // Clean up database
    await dataSource.query('TRUNCATE TABLE sessions CASCADE')
    await dataSource.query('TRUNCATE TABLE user_roles CASCADE')
    await dataSource.query("DELETE FROM users WHERE email LIKE '%@test-session.com'")

    // Create or get roles for testing
    const roleRepository = dataSource.getRepository(Role)

    let superAdminRole = await roleRepository.findOne({ where: { name: 'super-admin' } })
    if (!superAdminRole) {
      superAdminRole = await roleRepository.save({
        name: 'super-admin',
        priority: 100,
        description: 'Super Administrator'
      })
    }

    let adminRole = await roleRepository.findOne({ where: { name: 'admin' } })
    if (!adminRole) {
      adminRole = await roleRepository.save({
        name: 'admin',
        priority: 80,
        description: 'Administrator'
      })
    }

    let userRole = await roleRepository.findOne({ where: { name: 'user' } })
    if (!userRole) {
      userRole = await roleRepository.save({
        name: 'user',
        priority: 40,
        description: 'Regular User'
      })
    }

    // Create test users
    const userRepository = dataSource.getRepository(User)

    const superAdminData = await UserFactory.createWithHashedPassword({
      email: 'superadmin@test-session.com',
      password: SUPER_ADMIN_PASSWORD,
      primaryRoleId: superAdminRole.id
    })
    superAdminUser = await userRepository.save(superAdminData as User)

    const adminData = await UserFactory.createWithHashedPassword({
      email: 'admin@test-session.com',
      password: ADMIN_PASSWORD,
      primaryRoleId: adminRole.id
    })
    adminUser = await userRepository.save(adminData as User)

    const userData = await UserFactory.createWithHashedPassword({
      email: 'user@test-session.com',
      password: USER_PASSWORD,
      primaryRoleId: userRole.id
    })
    regularUser = await userRepository.save(userData as User)

    // Login all users for testing
    const superAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: superAdminUser.email, password: SUPER_ADMIN_PASSWORD })
    superAdminToken = superAdminLogin.body.data.accessToken

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminUser.email, password: ADMIN_PASSWORD })
    adminToken = adminLogin.body.data.accessToken

    const regularUserLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: regularUser.email, password: USER_PASSWORD })
    regularUserToken = regularUserLogin.body.data.accessToken
  })

  afterAll(async () => {
    await dataSource.query('TRUNCATE TABLE sessions CASCADE')
    await dataSource.query('TRUNCATE TABLE user_roles CASCADE')
    await dataSource.query("DELETE FROM users WHERE email LIKE '%@test-session.com'")
    await dataSource.destroy()
    await app.close()
  })

  describe('GET /api/v1/sessions/me - List Own Sessions', () => {
    it('should allow user to list their own sessions', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sessions/me')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(200)

      expect(response.body.data).toHaveProperty('sessions')
      expect(response.body.data).toHaveProperty('pagination')
      expect(response.body.data.sessions.length).toBeGreaterThan(0)
      expect(response.body.data.sessions[0]).toHaveProperty('id')
      expect(response.body.data.sessions[0]).toHaveProperty('deviceType')
    })

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/sessions/me').expect(401)
    })
  })

  describe('GET /api/v1/sessions/me/stats - Get Own Session Stats', () => {
    it('should return session statistics for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sessions/me/stats')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(200)

      expect(response.body.data).toHaveProperty('totalSessions')
      expect(response.body.data).toHaveProperty('activeSessions')
      expect(response.body.data).toHaveProperty('deviceStats')
      expect(response.body.data.totalSessions).toBeGreaterThan(0)
    })
  })

  describe('GET /api/v1/sessions/users/:userId - Super-Admin List User Sessions', () => {
    it('should allow super-admin to list any user sessions', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200)

      expect(response.body.data).toHaveProperty('success', true)
      expect(response.body.data).toHaveProperty('userId', regularUser.id)
      expect(response.body.data).toHaveProperty('sessions')
      expect(Array.isArray(response.body.data.sessions)).toBe(true)
      expect(response.body.data.sessions.length).toBeGreaterThan(0)
    })

    it('should deny admin access to list user sessions', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403)
    })

    it('should deny regular user access to list other user sessions', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403)
    })

    it('should support filtering by device type', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${regularUser.id}?filterByDevice=desktop`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
    })
  })

  describe('DELETE /api/v1/sessions/users/:userId/sessions/:sessionId - Super-Admin Revoke Specific Session', () => {
    it('should allow super-admin to revoke specific user session', async () => {
      // Create a fresh session for this test
      const freshLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: regularUser.email, password: USER_PASSWORD })
      const freshSessionId = freshLogin.body.data.sessionId
      const freshToken = freshLogin.body.data.accessToken

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/sessions/users/${regularUser.id}/sessions/${freshSessionId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'admin_action', notes: 'Security test' })
        .expect(200)

      expect(response.body.data).toHaveProperty('success', true)
      expect(response.body.data).toHaveProperty('sessionId', freshSessionId)
      expect(response.body.data).toHaveProperty('userId', regularUser.id)

      // The revoked session's access token stops working immediately (tokens carry sid)
      await request(app.getHttpServer())
        .get('/api/v1/sessions/me')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(401)

      // Verify session is marked as revoked in database
      const verifyRevoked = await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${regularUser.id}?includeExpired=true`)
        .set('Authorization', `Bearer ${superAdminToken}`)

      const revokedSession = verifyRevoked.body.data.sessions.find(
        (s: { id: string }) => s.id === freshSessionId
      )
      expect(revokedSession).toBeDefined()
      expect(revokedSession.revokedAt).toBeTruthy()
    })

    it('should deny admin access to revoke sessions', async () => {
      // Login regular user again
      const newLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: regularUser.email, password: USER_PASSWORD })
      const newSessionId = newLogin.body.data.sessionId

      await request(app.getHttpServer())
        .delete(`/api/v1/sessions/users/${regularUser.id}/sessions/${newSessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'admin_action', notes: 'Test' })
        .expect(403)
    })

    it('should return 404 for non-existent session', async () => {
      const fakeSessionId = '00000000-0000-0000-0000-000000000000'

      await request(app.getHttpServer())
        .delete(`/api/v1/sessions/users/${superAdminUser.id}/sessions/${fakeSessionId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'admin_action', notes: 'Test' })
        .expect(404)
    })

    it('should return 400 when session does not belong to specified user', async () => {
      // Get admin's session
      const adminSessions = await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)

      const adminSessionId = adminSessions.body.data.sessions[0].id

      // Try to revoke admin's session using wrong userId
      await request(app.getHttpServer())
        .delete(`/api/v1/sessions/users/${regularUser.id}/sessions/${adminSessionId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Test' })
        .expect(400)
    })
  })

  describe('DELETE /api/v1/sessions/users/:userId/sessions - Super-Admin Revoke All User Sessions', () => {
    it('should allow super-admin to revoke all user sessions', async () => {
      // Create multiple sessions for regular user
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: regularUser.email, password: USER_PASSWORD })

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: regularUser.email, password: USER_PASSWORD })

      // Revoke all sessions
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/sessions/users/${regularUser.id}/sessions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'admin_action', notes: 'Force logout all sessions' })
        .expect(200)

      expect(response.body.data).toHaveProperty('success', true)
      expect(response.body.data).toHaveProperty('userId', regularUser.id)
      expect(response.body.data).toHaveProperty('sessionsRevoked')
      expect(response.body.data.sessionsRevoked).toBeGreaterThan(0)

      // Verify all sessions are revoked
      const checkSessions = await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)

      const activeSessions = checkSessions.body.data.sessions.filter((s: any) => !s.revokedAt)
      expect(activeSessions.length).toBe(0)
    })

    it('should deny admin access to revoke all user sessions', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/sessions/users/${regularUser.id}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'admin_action', notes: 'Test' })
        .expect(403)
    })

    it('should deny regular user access to revoke other user sessions', async () => {
      // Login regular user again
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: regularUser.email, password: USER_PASSWORD })

      const newToken = (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: regularUser.email, password: USER_PASSWORD })
      ).body.data.accessToken

      await request(app.getHttpServer())
        .delete(`/api/v1/sessions/users/${adminUser.id}/sessions`)
        .set('Authorization', `Bearer ${newToken}`)
        .send({ reason: 'admin_action', notes: 'Test' })
        .expect(403)
    })
  })

  describe('Authorization Edge Cases', () => {
    it('should reject invalid JWT token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${regularUser.id}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)
    })

    it('should mark session as revoked in database', async () => {
      // Login
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: regularUser.email, password: USER_PASSWORD })

      const sessionId = loginResponse.body.data.sessionId

      // Revoke session
      await request(app.getHttpServer())
        .delete(`/api/v1/sessions/users/${regularUser.id}/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'admin_action', notes: 'Test revocation' })
        .expect(200)

      // Verify session is marked as revoked in database
      const checkResponse = await request(app.getHttpServer())
        .get(`/api/v1/sessions/users/${regularUser.id}?includeExpired=true`)
        .set('Authorization', `Bearer ${superAdminToken}`)

      const revokedSession = checkResponse.body.data.sessions.find(
        (s: { id: string }) => s.id === sessionId
      )
      expect(revokedSession).toBeDefined()
      expect(revokedSession.revokedAt).toBeTruthy()
    })
  })
  // users publishes UserCredentialsResetEvent; the auth listener revokes the sessions
  describe('Admin password reset (users -> auth domain event)', () => {
    const RESET_USER_PASSWORD = 'Reset@User123'
    // Apostrophes and quotes are valid in email local parts; the revocation reason embeds it
    const HOSTILE_ADMIN_EMAIL = `o'brien"); DROP TABLE sessions; --@test-session.com`
    const resetUserTokens: string[] = []
    let resetUser: User

    beforeAll(async () => {
      const data = await UserFactory.createWithHashedPassword({
        email: 'reset-target@test-session.com',
        password: RESET_USER_PASSWORD,
        primaryRoleId: regularUser.primaryRoleId
      })
      resetUser = await dataSource.getRepository(User).save(data as User)

      for (let i = 0; i < 2; i++) {
        const login = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: resetUser.email, password: RESET_USER_PASSWORD })
          .expect(201)
        resetUserTokens.push(login.body.data.accessToken)
      }

      // Both tokens work (and their "session usable" answers are now cached)
      for (const token of resetUserTokens) {
        await request(app.getHttpServer())
          .get('/api/v1/sessions/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
      }
    })

    const activeSessions = () =>
      dataSource.getRepository(Session).count({ where: { userId: resetUser.id, isActive: true } })

    it('revokes every session of the user when an admin resets the password', async () => {
      expect(await activeSessions()).toBe(2)

      const result = await app
        .get(AdminPasswordManagementService)
        .resetPassword({ userId: resetUser.id }, superAdminUser.id, HOSTILE_ADMIN_EMAIL)

      expect(result.temporaryPassword).toBeTruthy()
      expect(await activeSessions()).toBe(0)
    })

    it('stores the revocation reason literally (bound as a SQL parameter)', async () => {
      const sessions = await dataSource
        .getRepository(Session)
        .find({ where: { userId: resetUser.id } })

      expect(sessions).toHaveLength(2)
      for (const session of sessions) {
        expect(session.metadata?.revocationReason).toBe(
          `Password reset by admin: ${HOSTILE_ADMIN_EMAIL}`
        )
      }
    })

    it('rejects access tokens of the revoked sessions immediately, not at expiry', async () => {
      for (const token of resetUserTokens) {
        const response = await request(app.getHttpServer())
          .get('/api/v1/sessions/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(401)
        expect(response.body.error.message).toBe('Session has ended')
      }
    })

    it("does not touch other users' sessions", async () => {
      const others = await dataSource
        .getRepository(Session)
        .count({ where: { userId: regularUser.id, isActive: true } })
      expect(others).toBeGreaterThan(0)
    })
  })
})
