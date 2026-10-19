/**
 * Auth Module Integration Tests
 * Tests authentication flows with real database and Redis
 */

import { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { configureApp } from '@app/app.setup'
import { ENTITIES } from '@app/database/entities'
import { LoggerModule } from 'nestjs-pino'
import request from 'supertest'
import { DataSource } from 'typeorm'

import { AuthModule } from '@modules/auth/auth.module'
import { PasswordReset } from '@modules/auth/entities/password-reset.entity'
import { Session } from '@modules/auth/entities/session.entity'
import { User } from '@modules/users/entities/user.entity'
import { UsersModule } from '@modules/users/users.module'

import { CacheService } from '@core/cache/services/cache.service'
import { EventsModule } from '@core/events'
import { OutboxMessage } from '@core/outbox'
import { SentryModule } from '@core/sentry'

import { UserFactory } from '../../factories/user.factory'
import { InMemoryCacheService } from '../../helpers/in-memory-cache.service'
import { resetDatabase } from '../../helpers/reset-database'
import { seedDefaultRoles, SeededRoles } from '../../helpers/role-seeder'
import { TestRedis } from '../../helpers/test-redis'
import { testConfig } from '../../test.config'

const TABLES_TO_TRUNCATE = [
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Auth Integration Tests', () => {
  let app: INestApplication
  let dataSource: DataSource
  let testUser: User
  let adminUser: User
  let adminToken: string
  const TEST_PASSWORD = 'Password123!'
  const ADMIN_PASSWORD = 'Admin@123'
  let testCounter = 0
  let cacheStub: InMemoryCacheService
  let roles: SeededRoles

  beforeAll(async () => {
    // Create Redis connection
    await TestRedis.createConnection()

    // Create test module
    const moduleBuilder = Test.createTestingModule({
      imports: [
        EventsModule,
        SentryModule.forRoot(),
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => testConfig]
        }),
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'silent' // Suppress logs in tests
          }
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.TEST_DB_HOST,
          port: parseInt(process.env.TEST_DB_PORT || '5432'),
          username: process.env.TEST_DB_USERNAME,
          password: process.env.TEST_DB_PASSWORD,
          database: process.env.TEST_DB_NAME,
          entities: ENTITIES,
          synchronize: false, // Schema created in global setup
          dropSchema: false, // Don't drop - global setup handles this
          logging: false
        }),
        AuthModule,
        UsersModule
      ]
    })

    cacheStub = new InMemoryCacheService()
    const moduleFixture = await moduleBuilder
      .overrideProvider(CacheService)
      .useValue(cacheStub)
      .compile()

    app = moduleFixture.createNestApplication()
    configureApp(app)

    dataSource = app.get(DataSource)
    await app.init()
  })

  beforeEach(async () => {
    testCounter++

    // Clear database tables FIRST (foreign key constraints)
    await resetDatabase(dataSource, TABLES_TO_TRUNCATE)

    // Clear cache before each test (ioredis-mock is a singleton, need to clear all data)
    await TestRedis.clearCache()
    await cacheStub.reset()

    roles = await seedDefaultRoles(dataSource)

    // Create a test user with a unique email per test run
    const userRepository = dataSource.getRepository(User)
    const newUser = await UserFactory.createWithHashedPassword({
      password: TEST_PASSWORD,
      primaryRoleId: roles['user'].id
    })
    testUser = await userRepository.save(newUser as User)

    // Create admin user
    const newAdmin = await UserFactory.createWithHashedPassword({
      email: `admin${testCounter}@example.com`,
      name: 'Admin User',
      primaryRoleId: roles['super-admin'].id,
      password: ADMIN_PASSWORD
    })
    adminUser = await userRepository.save(newAdmin as User)

    // Login admin to get token
    const adminLoginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: adminUser.email,
      password: ADMIN_PASSWORD
    })
    adminToken = adminLoginResponse.body.data.accessToken
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
    await TestRedis.closeConnection()
  })

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: TEST_PASSWORD
        })
        .expect(201)

      expect(response.body.data).toHaveProperty('accessToken')
      expect(response.body.data).toHaveProperty('refreshToken')
      expect(response.body.data).toHaveProperty('user')
      expect(response.body.data.user.email).toBe(testUser.email)
    })

    it('should fail with invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!'
        })
        .expect(401)
    })

    it('should fail with non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: TEST_PASSWORD
        })
        .expect(401)
    })

    it('should fail with invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: TEST_PASSWORD
        })
        .expect(400)
    })

    it('should create a session after successful login', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: TEST_PASSWORD
        })
        .expect(201)

      const sessionRepository = dataSource.getRepository(Session)
      const sessions = await sessionRepository.find({ where: { userId: testUser.id } })

      expect(sessions.length).toBe(1)
      expect(sessions[0].userId).toBe(testUser.id)
    })
  })

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken: string

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: TEST_PASSWORD
      })

      refreshToken = loginResponse.body.data.refreshToken
    })

    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(201)

      expect(response.body.data).toHaveProperty('accessToken')
      expect(response.body.data).toHaveProperty('refreshToken')
    })

    it('ends the old session: its access token stops working, the new one works', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: TEST_PASSWORD })
        .expect(201)
      const me = (token: string) =>
        request(app.getHttpServer())
          .get('/api/v1/sessions/me')
          .set('Authorization', `Bearer ${token}`)

      await me(login.body.data.accessToken).expect(200)

      const refreshed = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.data.refreshToken })
        .expect(201)

      await me(login.body.data.accessToken).expect(401)
      await me(refreshed.body.data.accessToken).expect(200)
    })

    it('should fail with invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(400) // Validation error - invalid format
    })

    it('should fail without refresh token', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({}).expect(400)
    })
  })

  describe('POST /api/v1/auth/logout', () => {
    let accessToken: string
    let refreshToken: string

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: TEST_PASSWORD
      })

      accessToken = loginResponse.body.data.accessToken
      refreshToken = loginResponse.body.data.refreshToken
    })

    it('should logout successfully with valid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: refreshToken })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201)

      // Verify session is marked as inactive
      const sessionRepository = dataSource.getRepository(Session)
      const sessions = await sessionRepository.find({ where: { userId: testUser.id } })

      expect(sessions.length).toBeGreaterThan(0)
      expect(sessions.every(session => session.isActive === false)).toBe(true)
    })

    it('should fail without authorization header', async () => {
      await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401)
    })

    it('should prevent reuse of logged-out token', async () => {
      // Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201)

      // Try to use the same token again
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401) // Token should be blacklisted
    })
  })

  describe('Authentication Flow', () => {
    it('should complete full auth flow: login -> access protected route -> refresh -> logout', async () => {
      // 1. Login
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: TEST_PASSWORD
      })

      expect(loginResponse.status).toBe(201)

      const { accessToken, refreshToken } = loginResponse.body.data

      // 2. Access protected route (sessions list)
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      // 3. Refresh token
      const refreshResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(201)

      const newAccessToken = refreshResponse.body.data.accessToken
      const newRefreshToken = refreshResponse.body.data.refreshToken
      expect(newAccessToken).toBeDefined()
      expect(newRefreshToken).toBeDefined()

      // 4. Use new token
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200)

      // 5. Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: newRefreshToken })
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(201)

      // 6. Verify token is blacklisted
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(401)
    })
  })

  describe('Admin Password Management', () => {
    describe('POST /api/admin/users/reset-password (System-Generated)', () => {
      it('should reset user password with system-generated password', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/admin/users/reset-password')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: testUser.id,
            forcePasswordChange: true,
            reason: 'Integration test - system generated'
          })
          .expect(200)

        expect(response.body.data).toHaveProperty('userId', testUser.id)
        expect(response.body.data).toHaveProperty('email', testUser.email)
        expect(response.body.data).toHaveProperty('temporaryPassword')
        expect(response.body.data).toHaveProperty('forcePasswordChange', true)
        expect(response.body.data).toHaveProperty('changedBy')
        expect(response.body.data).toHaveProperty('reason', 'Integration test - system generated')

        // Verify password is strong (12 chars with complexity)
        const tempPassword = response.body.data.temporaryPassword
        expect(tempPassword).toHaveLength(12)
        expect(/[A-Z]/.test(tempPassword)).toBe(true) // uppercase
        expect(/[a-z]/.test(tempPassword)).toBe(true) // lowercase
        expect(/[0-9]/.test(tempPassword)).toBe(true) // digit
        expect(/[@$!%*?&]/.test(tempPassword)).toBe(true) // special char
      })

      it('should invalidate all user sessions after password reset', async () => {
        // Create session by logging in
        await request(app.getHttpServer()).post('/api/v1/auth/login').send({
          email: testUser.email,
          password: TEST_PASSWORD
        })

        // Verify session exists
        const sessionRepository = dataSource.getRepository(Session)
        let sessions = await sessionRepository.find({ where: { userId: testUser.id } })
        expect(sessions.length).toBe(1)
        expect(sessions[0].isActive).toBe(true)

        // Reset password
        await request(app.getHttpServer())
          .post('/api/admin/users/reset-password')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: testUser.id,
            forcePasswordChange: true,
            reason: 'Test session invalidation'
          })
          .expect(200)

        // Verify sessions are invalidated
        sessions = await sessionRepository.find({ where: { userId: testUser.id } })
        expect(sessions.length).toBe(1)
        expect(sessions[0].isActive).toBe(false)
      })

      it('should fail to reset password for non-existent user', async () => {
        await request(app.getHttpServer())
          .post('/api/admin/users/reset-password')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: '00000000-0000-0000-0000-000000000000',
            reason: 'Non-existent user test'
          })
          .expect(404)
      })

      it('should fail without admin authorization', async () => {
        await request(app.getHttpServer())
          .post('/api/admin/users/reset-password')
          .send({
            userId: testUser.id,
            reason: 'Unauthorized test'
          })
          .expect(401)
      })
    })

    describe('POST /api/admin/users/set-password (Admin-Defined)', () => {
      const adminDefinedPassword = 'AdminSet@456'

      it('should set specific password for user', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/admin/users/set-password')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: testUser.id,
            newPassword: adminDefinedPassword,
            forcePasswordChange: false,
            reason: 'Integration test - admin defined',
            sendNotification: false
          })
          .expect(200)

        expect(response.body.data).toHaveProperty('userId', testUser.id)
        expect(response.body.data).toHaveProperty('email', testUser.email)
        expect(response.body.data).toHaveProperty('forcePasswordChange', false)
        expect(response.body.data).not.toHaveProperty('temporaryPassword') // Not returned for set-password
        expect(response.body.data).toHaveProperty('changedBy')
      })

      it('should allow login with admin-defined password', async () => {
        // Set password
        await request(app.getHttpServer())
          .post('/api/admin/users/set-password')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: testUser.id,
            newPassword: adminDefinedPassword,
            forcePasswordChange: false,
            reason: 'Test login'
          })
          .expect(200)

        // Login with new password
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: testUser.email,
            password: adminDefinedPassword
          })
          .expect(201)

        expect(response.body.data).toHaveProperty('accessToken')
        expect(response.body.data).toHaveProperty('refreshToken')
      })

      it('should validate password complexity', async () => {
        await request(app.getHttpServer())
          .post('/api/admin/users/set-password')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: testUser.id,
            newPassword: 'weak', // Too weak
            reason: 'Validation test'
          })
          .expect(400)
      })

      it('should fail without admin authorization', async () => {
        await request(app.getHttpServer())
          .post('/api/admin/users/set-password')
          .send({
            userId: testUser.id,
            newPassword: adminDefinedPassword,
            reason: 'Unauthorized test'
          })
          .expect(401)
      })
    })
  })

  describe('Force Password Change Flow', () => {
    let temporaryPassword: string

    beforeEach(async () => {
      // Reset password with force change flag
      const response = await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUser.id,
          forcePasswordChange: true,
          reason: 'Force password change test'
        })

      temporaryPassword = response.body.data.temporaryPassword
    })

    it('should detect force password change flag on login', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: temporaryPassword
        })
        .expect(201)

      expect(response.body.data).toHaveProperty('requiresPasswordChange', true)
      expect(response.body.data).toHaveProperty('tempAccessToken')
      expect(response.body.data).not.toHaveProperty('accessToken') // No full access token
      expect(response.body.data).not.toHaveProperty('refreshToken')
    })

    it('should allow password change with temp token', async () => {
      // Login to get temp token
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: temporaryPassword
      })

      const tempToken = loginResponse.body.data.tempAccessToken

      // Change password
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'NewSecure@789',
          confirmPassword: 'NewSecure@789'
        })
        .expect(201)

      expect(response.body.data).toHaveProperty('message')
    })

    it('should clear force password change flag after change', async () => {
      // Login with temp password
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: temporaryPassword
      })

      const tempToken = loginResponse.body.data.tempAccessToken

      // Change password
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'NewSecure@789',
          confirmPassword: 'NewSecure@789'
        })
        .expect(201)

      // Login with new password - should get full access
      const newLoginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'NewSecure@789'
        })
        .expect(201)

      expect(newLoginResponse.body.data).toHaveProperty('accessToken')
      expect(newLoginResponse.body.data).toHaveProperty('refreshToken')
      expect(newLoginResponse.body.data).not.toHaveProperty('requiresPasswordChange')
      expect(newLoginResponse.body.data).not.toHaveProperty('tempAccessToken')
    })

    it('should set forcePasswordChange flag in database', async () => {
      const userRepository = dataSource.getRepository(User)
      const user = await userRepository.findOne({ where: { id: testUser.id } })

      expect(user).toBeDefined()
      expect(user!.forcePasswordChange).toBe(true)
    })

    it('should clear forcePasswordChange flag in database after password change', async () => {
      // Login and change password
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: temporaryPassword
      })

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${loginResponse.body.data.tempAccessToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'FinalSecure@999',
          confirmPassword: 'FinalSecure@999'
        })
        .expect(201)

      // Check database
      const userRepository = dataSource.getRepository(User)
      const user = await userRepository.findOne({ where: { id: testUser.id } })

      expect(user).toBeDefined()
      expect(user!.forcePasswordChange).toBe(false)
    })

    it('should reject weak passwords during forced change', async () => {
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: temporaryPassword
      })

      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${loginResponse.body.data.tempAccessToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'weak',
          confirmPassword: 'weak'
        })
        .expect(400)
    })
  })
  describe('POST /api/v1/auth/change-password (sessions)', () => {
    const OLD_PASSWORD = 'Original@Pass123'
    const NEW_PASSWORD = 'Changed@Pass456'

    // Validation failures must not be 401: clients treat 401 as "your session is gone"
    it('answers 400 for invalid input and 429 during the cooldown, never 401', async () => {
      const data = await UserFactory.createWithHashedPassword({
        email: `pw-status-${Date.now()}@example.com`,
        password: OLD_PASSWORD,
        primaryRoleId: roles['user'].id
      })
      const user = await dataSource.getRepository(User).save(data as User)
      const token = (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: OLD_PASSWORD })
          .expect(201)
      ).body.data.accessToken
      const change = (body: Record<string, string>) =>
        request(app.getHttpServer())
          .post('/api/v1/auth/change-password')
          .set('Authorization', `Bearer ${token}`)
          .send(body)

      await change({
        currentPassword: 'Wrong@Pass999',
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD
      }).expect(400)
      await change({
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: 'Other@Pass789'
      }).expect(400)
      await change({
        currentPassword: OLD_PASSWORD,
        newPassword: OLD_PASSWORD,
        confirmPassword: OLD_PASSWORD
      }).expect(400)

      await change({
        currentPassword: OLD_PASSWORD,
        newPassword: NEW_PASSWORD,
        confirmPassword: NEW_PASSWORD
      }).expect(201)
      const again = await change({
        currentPassword: NEW_PASSWORD,
        newPassword: 'Third@Pass789',
        confirmPassword: 'Third@Pass789'
      }).expect(429)
      expect(again.body.error.code).toBe('PASSWORD_CHANGE_COOLDOWN')

      // The session survived all of it
      await request(app.getHttpServer())
        .get('/api/v1/sessions/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    })

    it('keeps the session that made the change and ends the others', async () => {
      const data = await UserFactory.createWithHashedPassword({
        email: `pw-change-${Date.now()}@example.com`,
        password: OLD_PASSWORD,
        primaryRoleId: roles['user'].id
      })
      const user = await dataSource.getRepository(User).save(data as User)
      const login = () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: OLD_PASSWORD })
          .expect(201)
      const me = (token: string) =>
        request(app.getHttpServer())
          .get('/api/v1/sessions/me')
          .set('Authorization', `Bearer ${token}`)

      const current = (await login()).body.data.accessToken
      const other = (await login()).body.data.accessToken

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${current}`)
        .send({
          currentPassword: OLD_PASSWORD,
          newPassword: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD
        })
        .expect(201)

      expect(response.body.data.sessionsRevoked).toBe(1)
      expect(response.body.data.message).toContain('Other sessions have been logged out')
      await me(current).expect(200)
      await me(other).expect(401)
    })
  })
  describe('POST /api/v1/auth/register', () => {
    it('records the welcome email in the outbox with the new user', async () => {
      const email = `register-${Date.now()}@example.com`

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'Secure@Pass123', firstName: 'New', lastName: 'Person' })
        .expect(201)

      // One envelope: the payload is data itself, not { success, data } nested again
      expect(res.body).toMatchObject({
        success: true,
        data: { email, emailVerificationRequired: true }
      })
      expect(res.body.data).not.toHaveProperty('data')
      expect(res.body.data).not.toHaveProperty('success')

      const user = await dataSource.getRepository(User).findOneByOrFail({ email })
      const queued = await dataSource
        .getRepository(OutboxMessage)
        .createQueryBuilder('m')
        .where("m.payload->>'to' = :email", { email })
        .getMany()
      expect(queued).toHaveLength(1)
      expect(queued[0]).toMatchObject({
        queue: 'email-queue',
        jobName: 'send-welcome',
        status: 'pending'
      })
      expect(user.id).toBeDefined()
    })

    it('stores the email lowercased, so a mixed-case signup can log in', async () => {
      const stamp = Date.now()
      const typed = `Mixed.Case-${stamp}@Example.COM`
      const password = 'Secure@Pass123'

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: typed, password, firstName: 'Mixed', lastName: 'Case' })
        .expect(201)

      const lower = typed.toLowerCase()
      expect(await dataSource.getRepository(User).findOneBy({ email: lower })).not.toBeNull()

      for (const email of [typed, lower]) {
        const login = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password })
          .expect(201)
        expect(login.body.data.accessToken).toBeDefined()
      }

      // The same address in another case is the same account
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: lower.toUpperCase(), password, firstName: 'Dup', lastName: 'Case' })
        .expect(409)
    })
  })

  describe('POST /api/v1/auth/reset-password (policies)', () => {
    const FIRST = 'First@Pass123'
    const SECOND = 'Second@Pass456'

    const resetTo = async (email: string, newPassword: string) => {
      await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ email })
      const { token } = await dataSource
        .getRepository(PasswordReset)
        .findOneOrFail({ where: { email, used: false }, order: { createdAt: 'DESC' } })
      return request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword })
    }

    // "Forgot password" must not be a way around the reuse rules of change-password
    it('rejects the current password and recently used ones', async () => {
      const email = `reset-policy-${Date.now()}@example.com`
      const data = await UserFactory.createWithHashedPassword({
        email,
        password: FIRST,
        primaryRoleId: roles['user'].id
      })
      await dataSource.getRepository(User).save(data as User)

      expect((await resetTo(email, FIRST)).status).toBe(400)
      expect((await resetTo(email, SECOND)).status).toBeLessThan(300)
      expect((await resetTo(email, FIRST)).status).toBe(400) // now in the history
    })
  })
})
