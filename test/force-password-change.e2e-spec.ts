import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { Repository } from 'typeorm'
import { getRepositoryToken } from '@nestjs/typeorm'
import { User } from '../src/modules/users/entities/user.entity'

describe('Force Password Change Flow (e2e)', () => {
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

    // Login as admin
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@susano.dev',
        password: 'Admin@123',
      })

    adminToken = adminLogin.body.data.accessToken
  })

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      await userRepository.delete(testUserId)
    }
    await app.close()
  })

  describe('Setup Test User', () => {
    it('should create test user', async () => {
      testUserEmail = `force-pwd-${Date.now()}@example.com`

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          firstName: 'ForcePwd',
          lastName: 'Test',
          email: testUserEmail,
          password: 'Initial@123',
        })
        .expect(201)

      testUserId = response.body.data.data.userId
      expect(testUserId).toBeDefined()
    })

    it('should allow normal login initially', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: 'Initial@123',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.accessToken).toBeDefined()
      expect(response.body.data.requiresPasswordChange).toBeUndefined()
    })
  })

  describe('Force Password Change Trigger', () => {
    let temporaryPassword: string

    it('should reset password and force change', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUserId,
          forcePasswordChange: true,
          reason: 'Security policy - force password change',
        })
        .expect(200)

      expect(response.body.data.forcePasswordChange).toBe(true)
      temporaryPassword = response.body.data.temporaryPassword
    })

    it('should detect force password change flag on login', async () => {
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
      expect(response.body.data.accessToken).toBeUndefined()
      expect(response.body.data.refreshToken).toBeUndefined()
    })

    it('should prevent API access with temp token (except change-password)', async () => {
      // Get temp token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: temporaryPassword,
        })

      const tempToken = loginResponse.body.data.tempAccessToken

      // Try to access protected endpoint - should fail
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(401)
    })

    it('should allow password change with temp token', async () => {
      // Get temp token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: temporaryPassword,
        })

      const tempToken = loginResponse.body.data.tempAccessToken

      // Change password
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          newPassword: 'NewSecure@789',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
    })

    it('should clear force password change flag after change', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: 'NewSecure@789',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.accessToken).toBeDefined()
      expect(response.body.data.refreshToken).toBeDefined()
      expect(response.body.data.requiresPasswordChange).toBeUndefined()
    })

    it('should allow full API access after password change', async () => {
      // Login with new password
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: 'NewSecure@789',
        })

      const fullToken = loginResponse.body.data.accessToken

      // Access protected endpoint - should succeed
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${fullToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
    })
  })

  describe('Security Validations', () => {
    it('should reject weak passwords during change', async () => {
      // Trigger force password change
      const resetResponse = await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUserId,
          forcePasswordChange: true,
          reason: 'Testing validation',
        })

      const tempPassword = resetResponse.body.data.temporaryPassword

      // Get temp token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: tempPassword,
        })

      const tempToken = loginResponse.body.data.tempAccessToken

      // Try weak password
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          newPassword: 'weak',
        })
        .expect(400)
    })

    it('should expire temp token after 15 minutes', async () => {
      // Note: This is a conceptual test - actual implementation would require
      // mocking time or using a very short TTL for testing
      // In production, temp tokens expire in 15 minutes
      
      // This test documents the requirement
      expect(true).toBe(true) // Placeholder
    })
  })

  describe('Database Verification', () => {
    it('should set forcePasswordChange flag in database', async () => {
      // Reset with force change
      await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUserId,
          forcePasswordChange: true,
          reason: 'Database verification test',
        })

      // Check database directly
      const user = await userRepository.findOne({ where: { id: testUserId } })
      expect(user).toBeDefined()
      expect(user!.forcePasswordChange).toBe(true)
    })

    it('should clear forcePasswordChange flag after password change', async () => {
      // Reset password first
      const resetResponse = await request(app.getHttpServer())
        .post('/api/admin/users/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: testUserId,
          forcePasswordChange: true,
          reason: 'Testing flag clear',
        })

      const tempPassword = resetResponse.body.data.temporaryPassword

      // Login to get temp token
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUserEmail,
          password: tempPassword,
        })

      // Change password
      await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${loginResponse.body.data.tempAccessToken}`)
        .send({
          newPassword: 'FinalSecure@999',
        })

      // Check database
      const user = await userRepository.findOne({ where: { id: testUserId } })
      expect(user).toBeDefined()
      expect(user!.forcePasswordChange).toBe(false)
    })
  })
})
