/**
 * Account Lockout Integration Tests
 * Tests the automated account lockout system with real database, Redis, and queues
 */

import { BullModule, getQueueToken } from '@nestjs/bullmq'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerGuard } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'
import * as bcrypt from 'bcrypt'
import { Queue } from 'bullmq'
import { LoggerModule } from 'nestjs-pino'
import * as request from 'supertest'
import { DataSource } from 'typeorm'

import configuration from '../../../src/config/configuration'
import { CacheService } from '../../../src/core/cache/services/cache.service'
import { AccountSecurityJobType, QueueName } from '../../../src/core/queues/jobs/types'
import { AccountSecurityProcessor } from '../../../src/core/queues/processors/account-security.processor'
import { Permission } from '../../../src/modules/acl/entities/permission.entity'
import { Role } from '../../../src/modules/acl/entities/role.entity'
import { RolePermission } from '../../../src/modules/acl/entities/role-permission.entity'
import { UserRole } from '../../../src/modules/acl/entities/user-role.entity'
import { Attachment } from '../../../src/modules/attachments/entities/attachment.entity'
import { AuditLog } from '../../../src/modules/audit/entities/audit-log.entity'
import { AuthModule } from '../../../src/modules/auth/auth.module'
import { PasswordHistory } from '../../../src/modules/auth/entities/password-history.entity'
import { PasswordReset } from '../../../src/modules/auth/entities/password-reset.entity'
import { Session } from '../../../src/modules/auth/entities/session.entity'
import { AccountLockoutService } from '../../../src/modules/auth/services/account-lockout.service'
import { EmailVerification } from '../../../src/modules/users/entities/email-verification.entity'
import { User } from '../../../src/modules/users/entities/user.entity'
import { UsersModule } from '../../../src/modules/users/users.module'
import { seedDefaultRoles, SeededRoles } from '../../helpers/role-seeder'
import { TestRedis } from '../../helpers/test-redis'
import { testConfig } from '../../test.config'

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
      const result = await fn()
      store.set(key, result)
      return result
    }
  }
}

describe('Account Lockout Integration Tests', () => {
  let app: INestApplication
  let dataSource: DataSource
  let accountLockoutService: AccountLockoutService
  let accountSecurityQueue: Queue
  let accountSecurityProcessor: AccountSecurityProcessor
  let testUser: User
  let userPassword: string
  let roles: SeededRoles
  const MAX_FAILED_ATTEMPTS = 5

  const recordFailedAttempts = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await accountLockoutService.recordFailedAttempt(testUser.id)
    }
  }

  const lockAccountDirectly = async () => {
    await recordFailedAttempts(MAX_FAILED_ATTEMPTS)
  }

  beforeAll(async () => {
    // Create test Redis connection
    await TestRedis.createConnection()

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ...configuration(),
              security: {
                accountLockout: {
                  enabled: true,
                  maxAttempts: 5,
                  lockDuration: 5000, // 5 seconds for testing
                  resetAttemptsPeriod: 3000, // 3 seconds for testing
                  trackByIpAddress: true,
                  notifyOnLockout: false, // Disable emails in tests
                  notifyOnUnlock: false
                }
              }
            })
          ]
        }),
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'silent'
          }
        }),
        TypeOrmModule.forRoot({
          ...testConfig.database,
          type: 'postgres',
          entities: [
            User,
            Session,
            PasswordReset,
            EmailVerification,
            Role,
            Permission,
            UserRole,
            RolePermission,
            AuditLog,
            Attachment,
            PasswordHistory
          ],
          synchronize: true,
          dropSchema: true
        }),
        BullModule.forRoot({
          connection: {
            host: testConfig.redis.host,
            port: testConfig.redis.port,
            db: testConfig.redis.db
          }
        }),
        BullModule.registerQueue({
          name: QueueName.ACCOUNT_SECURITY
        }),
        AuthModule,
        UsersModule
      ],
      providers: [
        AccountSecurityProcessor,
        {
          provide: CacheService,
          useValue: createInMemoryCacheService()
        }
      ]
    })
      .overrideProvider(APP_GUARD)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    )

    await app.init()

    dataSource = moduleFixture.get<DataSource>(DataSource)
    accountLockoutService = moduleFixture.get<AccountLockoutService>(AccountLockoutService)
    accountSecurityQueue = moduleFixture.get<Queue>(getQueueToken(QueueName.ACCOUNT_SECURITY))
    accountSecurityProcessor = moduleFixture.get<AccountSecurityProcessor>(AccountSecurityProcessor)
    roles = await seedDefaultRoles(dataSource)

    // Create test user
    userPassword = 'Test@123456'
    const passwordHash = await bcrypt.hash(userPassword, 10)

    testUser = await dataSource.getRepository(User).save({
      name: 'Test User',
      email: 'lockout-test@example.com',
      mobileNumber: '+1234567890',
      passwordHash,
      isActive: true,
      emailVerified: true,
      failedLoginAttempts: 0,
      isLocked: false,
      primaryRoleId: roles['user'].id
    })
  })

  afterAll(async () => {
    // Clean up queue
    await accountSecurityQueue.obliterate({ force: true })
    await accountSecurityQueue.close()

    await dataSource.destroy()
    await app.close()
    await TestRedis.closeConnection()
  })

  beforeEach(async () => {
    // Reset user's lockout state before each test
    await dataSource.getRepository(User).update(testUser.id, {
      failedLoginAttempts: 0,
      isLocked: false,
      lockedAt: null,
      lockedUntil: null,
      lockReason: null
    })

    // Clear queue jobs
    await accountSecurityQueue.drain()
  })

  describe('Failed Login Attempts Tracking', () => {
    it('should track failed login attempts', async () => {
      // First failed attempt
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'wrong-password'
        })
        .expect(401)

      const user1 = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user1).toBeDefined()
      expect(user1!.failedLoginAttempts).toBe(1)
      expect(user1!.isLocked).toBe(false)

      // Second failed attempt
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'wrong-password-2'
        })
        .expect(401)

      const user2 = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user2).toBeDefined()
      expect(user2!.failedLoginAttempts).toBe(2)
      expect(user2!.isLocked).toBe(false)
    })

    it('should reset failed attempts on successful login', async () => {
      // Add some failed attempts
      await dataSource.getRepository(User).update(testUser.id, {
        failedLoginAttempts: 3
      })

      // Successful login
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: userPassword
        })
        .expect(201)

      expect(response.body).toHaveProperty('accessToken')
      expect(response.body).toHaveProperty('refreshToken')

      const user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user.failedLoginAttempts).toBe(0)
      expect(user.isLocked).toBe(false)
    })
  })

  describe('Account Lockout After Threshold', () => {
    it('should lock account after 5 failed attempts', async () => {
      await lockAccountDirectly()

      const user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user.isLocked).toBe(true)
      expect(user.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS)
      expect(user.lockedAt).toBeTruthy()
      expect(user.lockedUntil).toBeTruthy()
      expect(user.lockReason).toBe('FAILED_ATTEMPTS')
    })

    it('should prevent login when account is locked', async () => {
      await lockAccountDirectly()

      // Try to login with correct password - should return 423 Locked
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: userPassword
        })
        .expect(423)

      expect(response.body.statusCode).toBe(423)
      expect(response.body.error).toBe('Locked')
      expect(response.body.message).toContain('locked')
      expect(response.body.message).toContain('unlocked')
      expect(response.body.details).toHaveProperty('lockedAt')
      expect(response.body.details).toHaveProperty('lockedUntil')
      expect(response.body.details).toHaveProperty('unlockIn')
      expect(response.body.details.failedAttempts).toBe(5)
      expect(response.body.details.maxAttempts).toBe(5)
    })

    it('should return lockout information with remaining time', async () => {
      await lockAccountDirectly()

      const lockInfo = await accountLockoutService.getAccountLockInfo(testUser.id)

      expect(lockInfo.isLocked).toBe(true)
      expect(lockInfo.failedAttempts).toBe(5)
      expect(lockInfo.maxAttempts).toBe(5)
      expect(lockInfo.remainingAttempts).toBe(0)
      expect(lockInfo.lockedAt).toBeTruthy()
      expect(lockInfo.lockedUntil).toBeTruthy()
      expect(lockInfo.lockReason).toBe('FAILED_ATTEMPTS')
    })
  })

  describe('Queue Job Scheduling', () => {
    it('should schedule unlock job when account is locked', async () => {
      await lockAccountDirectly()

      // Check for delayed unlock job
      const delayedJobs = await accountSecurityQueue.getDelayed()
      const unlockJob = delayedJobs.find(
        job => job.name === AccountSecurityJobType.UNLOCK_ACCOUNT && job.data.userId === testUser.id
      )

      expect(unlockJob).toBeDefined()
      expect(unlockJob.data.reason).toBe('AUTO_UNLOCK')
    })

    it('should schedule reset failed attempts job', async () => {
      await recordFailedAttempts(3)

      // Check for delayed reset job
      const delayedJobs = await accountSecurityQueue.getDelayed()
      const resetJob = delayedJobs.find(
        job =>
          job.name === AccountSecurityJobType.RESET_FAILED_ATTEMPTS &&
          job.data.userId === testUser.id
      )

      expect(resetJob).toBeDefined()
    })
  })

  describe('Automatic Unlock via Queue', () => {
    it('should automatically unlock account after lockout duration', async () => {
      await lockAccountDirectly()

      let user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user.isLocked).toBe(true)

      // Process unlock job directly
      const delayedJobs = await accountSecurityQueue.getDelayed()
      const unlockJob = delayedJobs.find(
        job => job.name === AccountSecurityJobType.UNLOCK_ACCOUNT && job.data.userId === testUser.id
      )

      if (unlockJob) {
        await accountSecurityProcessor.process(unlockJob)
      }

      // Verify account is unlocked
      user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user.isLocked).toBe(false)
      expect(user.failedLoginAttempts).toBe(0)
      expect(user.lockedAt).toBeNull()
      expect(user.lockedUntil).toBeNull()
      expect(user.lockReason).toBeNull()

      // Should be able to login now
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: userPassword
        })
        .expect(201)
    })

    it('should unlock account after time passes', async () => {
      await lockAccountDirectly()

      // Manually set lockedUntil to past time
      await dataSource.getRepository(User).update(testUser.id, {
        lockedUntil: new Date(Date.now() - 1000) // 1 second ago
      })

      // isAccountLocked should auto-unlock
      const isLocked = await accountLockoutService.isAccountLocked(testUser.id)
      expect(isLocked).toBe(false)

      // Login should work
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: userPassword
        })
        .expect(201)
    })
  })

  describe('Admin Manual Unlock', () => {
    it('should allow admin to manually unlock account', async () => {
      await lockAccountDirectly()

      let user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user.isLocked).toBe(true)

      // Admin unlocks
      const adminId = 'admin-user-id'
      await accountLockoutService.adminUnlockAccount(testUser.id, adminId)

      user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user.isLocked).toBe(false)
      expect(user.failedLoginAttempts).toBe(0)

      // Should be able to login immediately
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: userPassword
        })
        .expect(201)
    })
  })

  describe('Reset Failed Attempts via Queue', () => {
    it('should reset failed attempts after reset period if no new failures', async () => {
      await recordFailedAttempts(3)

      let user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user.failedLoginAttempts).toBe(3)

      // Process reset job
      const delayedJobs = await accountSecurityQueue.getDelayed()
      const resetJob = delayedJobs.find(
        job =>
          job.name === AccountSecurityJobType.RESET_FAILED_ATTEMPTS &&
          job.data.userId === testUser.id
      )

      if (resetJob) {
        await accountSecurityProcessor.process(resetJob)

        user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
        expect(user.failedLoginAttempts).toBe(0)
      }
    })

    it('should not reset attempts if account is locked', async () => {
      await lockAccountDirectly()

      // Try to process reset job
      const delayedJobs = await accountSecurityQueue.getDelayed()
      const resetJob = delayedJobs.find(
        job =>
          job.name === AccountSecurityJobType.RESET_FAILED_ATTEMPTS &&
          job.data.userId === testUser.id
      )

      if (resetJob) {
        await accountSecurityProcessor.process(resetJob)

        const user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
        // Should still be locked and have 5 attempts
        expect(user.isLocked).toBe(true)
        expect(user.failedLoginAttempts).toBe(5)
      }
    })
  })

  describe('Unlock Expired Accounts Batch Operation', () => {
    it('should unlock multiple expired accounts', async () => {
      // Create additional test users and lock them
      const user2 = await dataSource.getRepository(User).save({
        name: 'Test User 2',
        email: 'test2@example.com',
        mobileNumber: '+15550000002',
        passwordHash: await bcrypt.hash('password', 10),
        primaryRoleId: roles['user'].id,
        isActive: true,
        isLocked: true,
        lockedAt: new Date(),
        lockedUntil: new Date(Date.now() - 1000), // Already expired
        lockReason: 'FAILED_ATTEMPTS',
        failedLoginAttempts: 5
      })

      const user3 = await dataSource.getRepository(User).save({
        name: 'Test User 3',
        email: 'test3@example.com',
        mobileNumber: '+15550000003',
        passwordHash: await bcrypt.hash('password', 10),
        primaryRoleId: roles['user'].id,
        isActive: true,
        isLocked: true,
        lockedAt: new Date(),
        lockedUntil: new Date(Date.now() - 2000), // Already expired
        lockReason: 'FAILED_ATTEMPTS',
        failedLoginAttempts: 5
      })

      // Run batch unlock
      await accountLockoutService.unlockExpiredAccounts()

      // Check both users are unlocked
      const unlockedUser2 = await dataSource.getRepository(User).findOne({
        where: { id: user2.id }
      })
      const unlockedUser3 = await dataSource.getRepository(User).findOne({
        where: { id: user3.id }
      })

      expect(unlockedUser2.isLocked).toBe(false)
      expect(unlockedUser3.isLocked).toBe(false)
    })
  })

  describe('Get Locked Accounts (Admin)', () => {
    it('should return list of locked accounts', async () => {
      await lockAccountDirectly()

      const lockedAccounts = await accountLockoutService.getLockedAccounts(10, 0)

      expect(lockedAccounts.users.length).toBeGreaterThan(0)
      const lockedUser = lockedAccounts.users.find(u => u.id === testUser.id)
      expect(lockedUser).toBeDefined()
      expect(lockedUser.isLocked).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle concurrent failed login attempts correctly', async () => {
      await recordFailedAttempts(MAX_FAILED_ATTEMPTS)

      const user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      expect(user.isLocked).toBe(true)
      expect(user.failedLoginAttempts).toBeGreaterThanOrEqual(MAX_FAILED_ATTEMPTS)
    })

    it('should handle non-existent user gracefully', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'non-existent@example.com',
          password: 'password'
        })
        .expect(401)
    })

    it('should not lock inactive users', async () => {
      // Deactivate user
      await dataSource.getRepository(User).update(testUser.id, {
        isActive: false
      })

      await recordFailedAttempts(MAX_FAILED_ATTEMPTS)

      const user = await dataSource.getRepository(User).findOne({ where: { id: testUser.id } })
      // User might be locked, but login should still fail due to inactive status
      expect(user.isActive).toBe(false)
    })
  })
})
