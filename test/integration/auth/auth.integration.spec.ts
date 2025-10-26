/**
 * Auth Module Integration Tests
 * Tests authentication flows with real database and Redis
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AuthModule } from '../../../src/auth/auth.module';
import { UsersModule } from '../../../src/users/users.module';
import { User } from '../../../src/users/entities/user.entity';
import { Session } from '../../../src/auth/entities/session.entity';
import { UserRole } from '../../../src/acl/entities/user-role.entity';
import { Role } from '../../../src/acl/entities/role.entity';
import { Permission } from '../../../src/acl/entities/permission.entity';
import { RolePermission } from '../../../src/acl/entities/role-permission.entity';
import { TestRedis } from '../../helpers/test-redis';
import { UserFactory } from '../../factories/user.factory';
import { testConfig } from '../../test.config';
import { ConfigModule } from '@nestjs/config';
import { CacheConfigModule } from '../../../src/cache/cache.module';
import { CacheService } from '../../../src/cache/services/cache.service';
import { LoggerModule } from 'nestjs-pino';

const TABLES_TO_TRUNCATE = [
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions',
];

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let testUser: User;
  const TEST_PASSWORD = 'Password123!';
  let testCounter = 0;

  beforeAll(async () => {
    // Create Redis connection
    await TestRedis.createConnection();

    // Create test module
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => testConfig],
        }),
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'silent', // Suppress logs in tests
          },
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: testConfig.database.host,
          port: testConfig.database.port,
          username: testConfig.database.username,
          password: testConfig.database.password,
          database: testConfig.database.database,
          entities: [User, Session, UserRole, Role, Permission, RolePermission],
          synchronize: true,
          logging: false,
        }),
        CacheConfigModule,
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    
    dataSource = app.get(DataSource);
    await app.init();
  });

  beforeEach(async () => {
    testCounter++;
    
    // Clear database tables FIRST (foreign key constraints)
    await dataSource.query(`TRUNCATE TABLE ${TABLES_TO_TRUNCATE.join(', ')} RESTART IDENTITY CASCADE`);
    
    // Clear cache before each test (ioredis-mock is a singleton, need to clear all data)
    await TestRedis.clearCache();
    
    // Also clear the app's cache service
    try {
      const cacheService = app.get(CacheService);
      if (cacheService) {
        await cacheService.reset();
      }
    } catch (error) {
      // CacheService might not be available in some tests
    }
    
    // Create a test user with a unique email per test run
    const userRepository = dataSource.getRepository(User);
    const newUser = await UserFactory.createWithHashedPassword({
      password: TEST_PASSWORD,
    });
    testUser = await userRepository.save(newUser as User);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await TestRedis.closeConnection();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: TEST_PASSWORD,
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
    });

    it('should fail with invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    it('should fail with non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: TEST_PASSWORD,
        })
        .expect(401);
    });

    it('should fail with invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: TEST_PASSWORD,
        })
        .expect(400);
    });

    it('should create a session after successful login', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: TEST_PASSWORD,
        })
        .expect(201);

      const sessionRepository = dataSource.getRepository(Session);
      const sessions = await sessionRepository.find();
      
      expect(sessions.length).toBe(1);
      expect(sessions[0].userId).toBe(testUser.id);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: TEST_PASSWORD,
        });
      
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should fail with invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(400); // Validation error - invalid format
    });

    it('should fail without refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: TEST_PASSWORD,
        });
      
      accessToken = loginResponse.body.accessToken;
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should logout successfully with valid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: refreshToken })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      
      // Verify session is marked as inactive
      const sessionRepository = dataSource.getRepository(Session);
      const sessions = await sessionRepository.find();
      
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].isActive).toBe(false);
    });

    it('should fail without authorization header', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });

    it('should prevent reuse of logged-out token', async () => {
      // Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      // Try to use the same token again
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401); // Token should be blacklisted
    });
  });

  describe('Authentication Flow', () => {
    it('should complete full auth flow: login -> access protected route -> refresh -> logout', async () => {
      // 1. Login
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: TEST_PASSWORD,
        });
      
      expect(loginResponse.status).toBe(201);
      
      const { accessToken, refreshToken } = loginResponse.body;

      // 2. Access protected route (sessions list)
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // 3. Refresh token
      const refreshResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(201);

      const newAccessToken = refreshResponse.body.accessToken;
      const newRefreshToken = refreshResponse.body.refreshToken;
      expect(newAccessToken).toBeDefined();
      expect(newRefreshToken).toBeDefined();

      // 4. Use new token
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);

      // 5. Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: newRefreshToken })
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(201);

      // 6. Verify token is blacklisted
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(401);
    });
  });
});
