/**
 * User Profile Integration Tests
 * Tests user profile API with authentication and caching
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

import { UserRepository } from '@modules/users/repositories/user.repository'

import { EventsModule } from '@core/events'
import { SentryModule } from '@core/sentry'

import { CacheService } from '../../../src/core/cache/services/cache.service'
import { AuthModule } from '../../../src/modules/auth/auth.module'
import { User } from '../../../src/modules/users/entities/user.entity'
import { UserAvailabilityService } from '../../../src/modules/users/services/user-availability.service'
import { UserRolesService } from '../../../src/modules/users/services/user-roles.service'
import { UsersModule } from '../../../src/modules/users/users.module'
import { UserFactory } from '../../factories/user.factory'
import { InMemoryCacheService } from '../../helpers/in-memory-cache.service'
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

describe('User Profile Integration Tests', () => {
  let app: INestApplication
  let dataSource: DataSource
  let testUser: User
  let accessToken: string
  const TEST_PASSWORD = 'Password123!'
  let cacheStub: InMemoryCacheService
  let roles: SeededRoles

  beforeAll(async () => {
    await TestRedis.createConnection()

    cacheStub = new InMemoryCacheService()

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
            level: 'silent'
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
    configureApp(app)
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
      .expect(201)

    accessToken = loginResponse.body.data.accessToken
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

      expect(response.body.data).toMatchObject({
        id: testUser.id,
        name: 'Test User',
        email: 'test@example.com',
        isActive: true,
        isVerified: true
      })
      // Role is exposed by name plus a roleInfo object, not as primaryRoleId
      expect(response.body.data.role).toBe('user')
      expect(response.body.data.roleInfo?.id).toBe(roles['user'].id)

      // Ensure sensitive fields are NOT exposed
      expect(response.body.data.passwordHash).toBeUndefined()
      expect(response.body.data.forcePasswordChange).toBeUndefined()
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

    it('serves the same profile on repeated requests', async () => {
      const first = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
      const second = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      expect(second.body.data).toEqual(first.body.data)
      expect(first.body.data.id).toBe(testUser.id)
    })

    it('should include all safe user fields in response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)

      // Check all expected fields are present
      expect(response.body.data).toHaveProperty('id')
      expect(response.body.data).toHaveProperty('name')
      expect(response.body.data).toHaveProperty('email')
      expect(response.body.data).toHaveProperty('mobileNumber')
      expect(response.body.data).toHaveProperty('role')
      expect(response.body.data).toHaveProperty('isActive')
      expect(response.body.data).toHaveProperty('isVerified')
      expect(response.body.data).toHaveProperty('isEmailVerified')
      expect(response.body.data).toHaveProperty('emailVerifiedAt')
      expect(response.body.data).toHaveProperty('createdAt')
      expect(response.body.data).toHaveProperty('updatedAt')

      // Verify sensitive fields are excluded
      expect(response.body.data).not.toHaveProperty('passwordHash')
      expect(response.body.data).not.toHaveProperty('forcePasswordChange')
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
        .expect(201)

      const unverifiedToken = loginResponse.body.data.accessToken

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${unverifiedToken}`)
        .expect(200)

      expect(response.body.data.emailVerifiedAt).toBeNull()
      expect(response.body.data.isEmailVerified).toBe(false)
    })
  })

  describe('cache coherence', () => {
    it('shows a role change in the cached role listing', async () => {
      const userRoles = app.get(UserRolesService)
      // A caller allowed to manage the user (as a super-admin is)
      const admin = {
        id: testUser.id,
        name: 'Admin',
        email: 'admin@example.com',
        canManageUser: () => true
      } as unknown as User
      const before = await userRoles.getUserRoles(testUser.id) // warms the user cache
      expect(before.roles.map(r => r.name)).not.toContain('moderator')

      await userRoles.assignRole(testUser.id, { roleId: roles['moderator'].id }, admin)

      const after = await userRoles.getUserRoles(testUser.id)
      expect(after.roles.map(r => r.name)).toContain('moderator')

      await userRoles.revokeRole(testUser.id, roles['moderator'].id, admin)
      expect((await userRoles.getUserRoles(testUser.id)).roles.map(r => r.name)).not.toContain(
        'moderator'
      )
    })

    it('reports an email as taken once an account uses it', async () => {
      const availability = app.get(UserAvailabilityService)
      const email = `fresh-${Date.now()}@example.com`
      expect((await availability.isEmailAvailable(email)).available).toBe(true) // cached

      // A write through the repository, as registration does
      await app.get(UserRepository).create({
        name: 'Fresh User',
        email,
        passwordHash: 'not-a-real-hash',
        primaryRoleId: roles['user'].id
      })

      expect((await availability.isEmailAvailable(email)).available).toBe(false)
    })
  })
})
