import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { Repository } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { User } from '../src/modules/users/entities/user.entity'

describe('Admin Password Management (e2e)', () => {
  let app: INestApplication
  let userRepository: Repository<User>
  let adminToken: string
  let testUserId: string
  let testUserEmail: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    await app.init()

    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    )
  })

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      await userRepository.delete(testUserId)
    }
    await app.close()
  })

  describe('Authentication & Setup', () => {
    it('should login as super admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@susano.dev',
          password: 'Admin@123',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.accessToken).toBeDefined()
      adminToken = response.body.data.accessToken
    })

    it('should create a test user', async () => {
      testUserEmail = `admin-test-${Date.now()}@example.com`
      
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Admin',
          lastName: 'TestUser',
          email: testUserEmail,
          password: 'TestUser@123',
        })
        .expect(201)

      expect(response.body.success).toBe(true)
      expect(response.body.data.data.userId).toBeDefined()
      testUserId = response.body.data.data.userId
    })
  })

  describe('Admin Reset Password (System-Generated)', () => {
    let temporaryPassword: string

    it('should reset user password with system-generated password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUserId,
          forcePasswordChange: true,
          reason: 'E2E testing - system generated password',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.temporaryPassword).toBeDefined()
      expect(response.body.data.forcePasswordChange).toBe(true)
      expect(response.body.data.userId).toBe(testUserId)
      
      temporaryPassword = response.body.data.temporaryPassword
      
      // Verify password is strong (12 chars with complexity)
      expect(temporaryPassword).toHaveLength(12)
      expect(/[A-Z]/.test(temporaryPassword)).toBe(true) // uppercase
      expect(/[a-z]/.test(temporaryPassword)).toBe(true) // lowercase
      expect(/[0-9]/.test(temporaryPassword)).toBe(true) // digit
      expect(/[@$!%*?&]/.test(temporaryPassword)).toBe(true) // special char
    })

    it('should login with temporary password and require password change', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: temporaryPassword,
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.requiresPasswordChange).toBe(true)
      expect(response.body.data.tempAccessToken).toBeDefined()
      expect(response.body.data.accessToken).toBeUndefined() // No full access
    })

    it('should change password using temp token', async () => {
      // First login to get temp token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: temporaryPassword,
        })

      const tempToken = loginResponse.body.data.tempAccessToken

      // Now change password
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          newPassword: 'NewSecure@123',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
    })

    it('should login with new password successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: 'NewSecure@123',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.accessToken).toBeDefined()
      expect(response.body.data.refreshToken).toBeDefined()
      expect(response.body.data.requiresPasswordChange).toBeUndefined()
    })
  })

  describe('Admin Set Password (Admin-Defined)', () => {
    const adminDefinedPassword = 'AdminSet@456'

    it('should set specific password for user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/users/set-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUserId,
          newPassword: adminDefinedPassword,
          forcePasswordChange: false, // User can use this password permanently
          reason: 'E2E testing - admin defined password',
          sendNotification: false,
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.userId).toBe(testUserId)
      expect(response.body.data.forcePasswordChange).toBe(false)
      expect(response.body.data.temporaryPassword).toBeUndefined() // Not returned for set-password
    })

    it('should login with admin-defined password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: adminDefinedPassword,
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.accessToken).toBeDefined()
      expect(response.body.data.requiresPasswordChange).toBeUndefined()
    })
  })

  describe('Authorization & Security', () => {
    it('should reject unauthorized requests', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .send({
          userId: testUserId,
          reason: 'Unauthorized attempt',
        })
        .expect(401)
    })

    it('should reject invalid user ID', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: '00000000-0000-0000-0000-000000000000',
          reason: 'Invalid user',
        })
        .expect(404)
    })

    it('should validate password complexity for set-password', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/users/set-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUserId,
          newPassword: 'weak', // Too weak
          reason: 'Testing validation',
        })
        .expect(400)
    })
  })
})
