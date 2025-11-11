/**
 * Auth Module Integration Tests
 * Tests authentication flows with real database and Redis
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import * as request from 'supertest'
import { AuthModule } from '@modules/auth/auth.module'
import { UsersModule } from '@modules/users/users.module'
import { User } from '@modules/users/entities/user.entity'
import { Session } from '@modules/auth/entities/session.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { Permission } from '@modules/acl/entities/permission.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'
import { TestRedis } from '../../helpers/test-redis'
import { UserFactory } from '../../factories/user.factory'
import { testConfig } from '../../test.config'
import { ConfigModule } from '@nestjs/config'
import { CacheService } from '@core/cache/services/cache.service'
import { LoggerModule } from 'nestjs-pino'

const createInMemoryCacheService = () => {
  const store = new Map<string, any>()
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: any) => {
      store.set(key, value)
    },
    del: async (key: string) => {
      store.delete(key)
    },
    delPattern: async (pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      for (const key of store.keys()) {
        if (regex.test(key)) {
          store.delete(key)
        }
      }
    },
    reset: async () => {
      store.clear()
    },
    wrap: async (key: string, fn: () => Promise<any>) => {
      if (store.has(key)) {
        return store.get(key)
      }
      const value = await fn()
      store.set(key, value)
      return value
    },
    isHealthy: async () => true,
    buildKey: (...parts: (string | number)[]) => parts.join(':')
  }
}

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
  let cacheStub: ReturnType<typeof createInMemoryCacheService>

  beforeAll(async () => {
    // Create Redis connection
    await TestRedis.createConnection()

    // Create test module
    const moduleBuilder = Test.createTestingModule({
      imports: [
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
          entities: [User, Session, UserRole, Role, Permission, RolePermission, AuditLog],
          synchronize: false, // Schema created in global setup
          dropSchema: false, // Don't drop - global setup handles this
          logging: false
        }),
        AuthModule,
        UsersModule
      ]
    })

    cacheStub = createInMemoryCacheService()
    const moduleFixture = await moduleBuilder
      .overrideProvider(CacheService)
      .useValue(cacheStub)
      .compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true
      })
    )

    dataSource = app.get(DataSource)
    await app.init()
  })

  beforeEach(async () => {
    testCounter++

    // Clear database tables FIRST (foreign key constraints)
    await dataSource.query(
      `TRUNCATE TABLE ${TABLES_TO_TRUNCATE.join(', ')} RESTART IDENTITY CASCADE`
    )

    // Clear cache before each test (ioredis-mock is a singleton, need to clear all data)
    await TestRedis.clearCache()
    await cacheStub.reset()

    // Create a test user with a unique email per test run
    const userRepository = dataSource.getRepository(User)
    const newUser = await UserFactory.createWithHashedPassword({
      password: TEST_PASSWORD
    })
    testUser = await userRepository.save(newUser as User)

    // Create admin user
    const newAdmin = await UserFactory.createWithHashedPassword({
      email: `admin${testCounter}@example.com`,
      name: 'Admin User',
      primaryRoleId: 1, // super-admin
      password: ADMIN_PASSWORD
    })
    adminUser = await userRepository.save(newAdmin as User)

    // Login admin to get token
    const adminLoginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: adminUser.email,
      password: ADMIN_PASSWORD
    })
    adminToken = adminLoginResponse.body.accessToken
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

      expect(response.body).toHaveProperty('accessToken')
      expect(response.body).toHaveProperty('refreshToken')
      expect(response.body).toHaveProperty('user')
      expect(response.body.user.email).toBe(testUser.email)
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
      const response = await request(app.getHttpServer())
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

      refreshToken = loginResponse.body.refreshToken
    })

    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(201)

      expect(response.body).toHaveProperty('accessToken')
      expect(response.body).toHaveProperty('refreshToken')
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

      accessToken = loginResponse.body.accessToken
      refreshToken = loginResponse.body.refreshToken
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

      const { accessToken, refreshToken } = loginResponse.body

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

      const newAccessToken = refreshResponse.body.accessToken
      const newRefreshToken = refreshResponse.body.refreshToken
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

        expect(response.body).toHaveProperty('userId', testUser.id)
        expect(response.body).toHaveProperty('email', testUser.email)
        expect(response.body).toHaveProperty('temporaryPassword')
        expect(response.body).toHaveProperty('forcePasswordChange', true)
        expect(response.body).toHaveProperty('changedBy')
        expect(response.body).toHaveProperty('reason', 'Integration test - system generated')

        // Verify password is strong (12 chars with complexity)
        const tempPassword = response.body.temporaryPassword
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

        expect(response.body).toHaveProperty('userId', testUser.id)
        expect(response.body).toHaveProperty('email', testUser.email)
        expect(response.body).toHaveProperty('forcePasswordChange', false)
        expect(response.body).not.toHaveProperty('temporaryPassword') // Not returned for set-password
        expect(response.body).toHaveProperty('changedBy')
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

        expect(response.body).toHaveProperty('accessToken')
        expect(response.body).toHaveProperty('refreshToken')
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

      temporaryPassword = response.body.temporaryPassword
    })

    it('should detect force password change flag on login', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: temporaryPassword
        })
        .expect(201)

      expect(response.body).toHaveProperty('requiresPasswordChange', true)
      expect(response.body).toHaveProperty('tempAccessToken')
      expect(response.body).not.toHaveProperty('accessToken') // No full access token
      expect(response.body).not.toHaveProperty('refreshToken')
    })

    it('should allow password change with temp token', async () => {
      // Login to get temp token
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: temporaryPassword
      })

      const tempToken = loginResponse.body.tempAccessToken

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

      expect(response.body).toHaveProperty('message')
    })

    it('should clear force password change flag after change', async () => {
      // Login with temp password
      const loginResponse = await request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: testUser.email,
        password: temporaryPassword
      })

      const tempToken = loginResponse.body.tempAccessToken

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

      expect(newLoginResponse.body).toHaveProperty('accessToken')
      expect(newLoginResponse.body).toHaveProperty('refreshToken')
      expect(newLoginResponse.body).not.toHaveProperty('requiresPasswordChange')
      expect(newLoginResponse.body).not.toHaveProperty('tempAccessToken')
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
        .set('Authorization', `Bearer ${loginResponse.body.tempAccessToken}`)
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
        .set('Authorization', `Bearer ${loginResponse.body.tempAccessToken}`)
        .send({
          currentPassword: temporaryPassword,
          newPassword: 'weak',
          confirmPassword: 'weak'
        })
        .expect(400)
    })
  })
})
