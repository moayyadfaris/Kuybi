/**
 * User Profile Integration Tests
 * Tests user profile API with authentication and caching
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import * as request from 'supertest'
import { AuthModule } from '../../../src/modules/auth/auth.module'
import { UsersModule } from '../../../src/modules/users/users.module'
import { User } from '../../../src/modules/users/entities/user.entity'
import { Session } from '../../../src/modules/auth/entities/session.entity'
import { UserRole } from '../../../src/modules/acl/entities/user-role.entity'
import { Role } from '../../../src/modules/acl/entities/role.entity'
import { Permission } from '../../../src/modules/acl/entities/permission.entity'
import { RolePermission } from '../../../src/modules/acl/entities/role-permission.entity'
import { Attachment } from '../../../src/modules/attachments/entities/attachment.entity'
import { PasswordHistory } from '../../../src/modules/auth/entities/password-history.entity'
import { TestRedis } from '../../helpers/test-redis'
import { UserFactory } from '../../factories/user.factory'
import { testConfig } from '../../test.config'
import { ConfigModule } from '@nestjs/config'
import { CacheService } from '../../../src/core/cache/services/cache.service'
import { LoggerModule } from 'nestjs-pino'
import { seedDefaultRoles, SeededRoles } from '../../helpers/role-seeder'

const createInMemoryCacheService = () => {
  const store = new Map<string, unknown>()
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
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
    wrap: async (key: string, fn: () => Promise<unknown>) => {
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

describe('User Profile Integration Tests', () => {
  let app: INestApplication
  let dataSource: DataSource
  let testUser: User
  let accessToken: string
  const TEST_PASSWORD = 'Password123!'
  let cacheStub: ReturnType<typeof createInMemoryCacheService>
  let roles: SeededRoles

  beforeAll(async () => {
    await TestRedis.createConnection()

    cacheStub = createInMemoryCacheService()

    const moduleBuilder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => testConfig]
        }),
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'silent'
          }
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.TEST_DB_HOST,
          port: parseInt(process.env.TEST_DB_PORT || '5432'),
          username: process.env.TEST_DB_USERNAME,
          password: process.env.TEST_DB_PASSWORD,
          database: process.env.TEST_DB_DATABASE,
          entities: [User, Session, UserRole, Role, Permission, RolePermission, Attachment, PasswordHistory],
          synchronize: false,
          logging: false
        }),
        AuthModule,
        UsersModule
      ]
    })

    const module: TestingModule = await moduleBuilder
      .overrideProvider(CacheService)
      .useValue(cacheStub)
      .compile()

    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
    await app.init()

    dataSource = module.get<DataSource>(DataSource)
  })

  beforeEach(async () => {
    await cacheStub.reset()

    for (const table of TABLES_TO_TRUNCATE) {
      await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`)
    }

    roles = await seedDefaultRoles(dataSource)

    const userData = await UserFactory.createWithHashedPassword({
      email: 'test@example.com',
      password: TEST_PASSWORD,
      name: 'Test User',
      primaryRoleId: roles['user'].id,
      isActive: true,
      isVerified: true
    })

    testUser = await dataSource.getRepository(User).save(userData)

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: TEST_PASSWORD
      })
      .expect(200)

    accessToken = loginResponse.body.accessToken
  })

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy()
    }
    await TestRedis.closeConnection()
    await app?.close()
  })

  describe('GET /api/v1/users/me', () => {
    it('should return current user profile when authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      expect(response.body).toMatchObject({
        id: testUser.id,
        name: 'Test User',
        email: 'test@example.com',
        isActive: true,
        isVerified: true
      })
      // Note: role is now derived from primaryRoleId, not stored directly
      expect(response.body.primaryRoleId).toBe(roles['user'].id)

      // Ensure sensitive fields are NOT exposed
      expect(response.body.passwordHash).toBeUndefined()
      expect(response.body.forcePasswordChange).toBeUndefined()
    })

    it('should return 401 when not authenticated', async () => {
      await request(app.getHttpServer()).get('/api/v1/users/me').expect(401)
    })

    it('should return 401 with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)
    })

    it('should cache user profile and serve from cache on second request', async () => {
      // First request - should hit database
      const response1 = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      expect(response1.body.id).toBe(testUser.id)

      // Verify cache was populated
      const cacheKey = `user:profile:safe:${testUser.id}`
      const cachedData = (await cacheStub.get(cacheKey)) as { id: string } | undefined
      expect(cachedData).toBeDefined()
      expect(cachedData?.id).toBe(testUser.id)

      // Second request - should serve from cache
      const response2 = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      expect(response2.body).toEqual(response1.body)
    })

    it('should include all safe user fields in response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      // Check all expected fields are present
      expect(response.body).toHaveProperty('id')
      expect(response.body).toHaveProperty('name')
      expect(response.body).toHaveProperty('email')
      expect(response.body).toHaveProperty('mobileNumber')
      expect(response.body).toHaveProperty('role')
      expect(response.body).toHaveProperty('isActive')
      expect(response.body).toHaveProperty('isVerified')
      expect(response.body).toHaveProperty('isEmailVerified')
      expect(response.body).toHaveProperty('emailVerifiedAt')
      expect(response.body).toHaveProperty('createdAt')
      expect(response.body).toHaveProperty('updatedAt')

      // Verify sensitive fields are excluded
      expect(response.body).not.toHaveProperty('passwordHash')
      expect(response.body).not.toHaveProperty('forcePasswordChange')
    })

    it('should return null for emailVerifiedAt if not verified', async () => {
      const unverifiedUserData = await UserFactory.createWithHashedPassword({
        email: 'unverified@example.com',
        password: TEST_PASSWORD,
        name: 'Unverified User',
        primaryRoleId: roles['user'].id,
        isActive: true,
        isVerified: false,
        isEmailVerified: false,
        emailVerifiedAt: null
      })

      await dataSource.getRepository(User).save(unverifiedUserData)

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'unverified@example.com',
          password: TEST_PASSWORD
        })
        .expect(200)

      const unverifiedToken = loginResponse.body.accessToken

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${unverifiedToken}`)
        .expect(200)

      expect(response.body.emailVerifiedAt).toBeNull()
      expect(response.body.isEmailVerified).toBe(false)
    })
  })
})
