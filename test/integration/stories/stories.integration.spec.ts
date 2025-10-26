/**
 * Stories Module Integration Tests
 * Tests story CRUD operations with database and cache
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { StoriesModule } from '../../../src/stories/stories.module';
import { TagsModule } from '../../../src/tags/tags.module';
import { AuthModule } from '../../../src/auth/auth.module';
import { UsersModule } from '../../../src/users/users.module';
import { Story } from '../../../src/stories/entities/story.entity';
import { Tag } from '../../../src/tags/entities/tag.entity';
import { User } from '../../../src/users/entities/user.entity';
import { Session } from '../../../src/auth/entities/session.entity';
import { UserRole } from '../../../src/acl/entities/user-role.entity';
import { Role } from '../../../src/acl/entities/role.entity';
import { Permission } from '../../../src/acl/entities/permission.entity';
import { RolePermission } from '../../../src/acl/entities/role-permission.entity';
import { Country } from '../../../src/countries/entities/country.entity';
import { Attachment } from '../../../src/attachments/entities/attachment.entity';
import { Category } from '../../../src/categories/entities/category.entity';
import { TestRedis } from '../../helpers/test-redis';
import { UserFactory } from '../../factories/user.factory';
import { StoryFactory } from '../../factories/story.factory';
import { testConfig } from '../../test.config';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { LoggerModule } from 'nestjs-pino';
import { LoggingModule } from '../../../src/logging/logging.module';
import { AclModule } from '../../../src/acl/acl.module';
import { AbilityGuard } from '../../../src/acl/abilities/ability.guard';

const STORY_TABLES_TO_TRUNCATE = [
  'story_tags',
  'story_categories',
  'story_attachments',
  'stories',
  'tags',
  'categories',
  'attachments',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions',
];

describe('Stories Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let testUser: User;

  beforeAll(async () => {
    // Create Redis connection
    await TestRedis.createConnection();

    // Create test module
    const moduleBuilder = Test.createTestingModule({
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
          entities: [User, Session, UserRole, Role, Permission, RolePermission, Story, Tag, Category, Attachment, Country],
          synchronize: true,
          logging: false,
        }),
        CacheModule.register({
          isGlobal: true,
          ttl: 60,
        }),
        LoggingModule,
        AclModule,
        StoriesModule,
        TagsModule,
        AuthModule,
        UsersModule,
      ],
    });

    moduleBuilder.overrideGuard(AbilityGuard).useValue({ canActivate: () => true });
    const moduleFixture: TestingModule = await moduleBuilder.compile();

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
    // Clear cache before each test
    await TestRedis.clearCache();
    
    // Clear database tables
    await dataSource.query(`TRUNCATE TABLE ${STORY_TABLES_TO_TRUNCATE.join(', ')} RESTART IDENTITY CASCADE`);
    
    // Create test user and get auth token
    const userRepository = dataSource.getRepository(User);
    const hashedUser = await UserFactory.createWithHashedPassword({
      password: 'Password123!',
      role: 'super-admin',
    });
    testUser = await userRepository.save(hashedUser as User);

    // Login to get access token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testUser.email,
        password: 'Password123!',
      });

    accessToken = loginResponse.body.accessToken;
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await TestRedis.closeConnection();
  });

  describe('POST /api/v1/stories', () => {
    it('should create a story successfully', async () => {
      const storyData = StoryFactory.create({
        title: 'Test Story',
        details: 'Test story details',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(storyData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(storyData.title);
      expect(response.body.details).toBe(storyData.details);
      expect(response.body.userId).toBe(testUser.id);
    });

    it('should create story with tags by name', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/stories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Story with Tags',
          details: 'Testing tag assignment',
          type: 'REPORT',
          status: 'DRAFT',
          priority: 'NORMAL',
          tags: ['politics', 'economy'],
        })
        .expect(201);

      const storyId = createResponse.body.id;
      const storyResponse = await request(app.getHttpServer())
        .get(`/api/v1/stories/${storyId}`)
        .expect(200);

      expect(storyResponse.body.tags).toHaveLength(2);
      const tagNames = storyResponse.body.tags.map((tag) => tag.name).sort();
      expect(tagNames).toEqual(['economy', 'politics']);
    });

    it('should fail without authentication', async () => {
      const storyData = StoryFactory.create();

      await request(app.getHttpServer())
        .post('/api/v1/stories')
        .send(storyData)
        .expect(401);
    });

    it('should fail with invalid data', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/stories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          // Missing required fields
          type: 'REPORT',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/stories', () => {
    beforeEach(async () => {
      // Create test stories
      const storyRepository = dataSource.getRepository(Story);
      const stories = StoryFactory.createMany(5, { userId: testUser.id });
      
      for (const storyData of stories) {
        await storyRepository.save(storyData as Story);
      }
    });

    it('should list all stories', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/stories')
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.results.length).toBe(5);
    });

    it('should filter stories by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/stories')
        .query({ status: 'DRAFT' })
        .expect(200);

      expect(response.body.results.every((s: any) => s.status === 'DRAFT')).toBe(true);
    });

    it('should paginate results', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/stories')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body.results.length).toBe(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
    });

    it('should include tags and categories in response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/stories')
        .expect(200);

      const story = response.body.results[0];
      expect(story).toHaveProperty('tags');
      expect(story).toHaveProperty('categories');
    });
  });

  describe('GET /api/v1/stories/:id', () => {
    let storyId: number;

    beforeEach(async () => {
      const storyRepository = dataSource.getRepository(Story);
      const story = await storyRepository.save(
        StoryFactory.create({ userId: testUser.id }) as Story,
      );
      storyId = story.id;
    });

    it('should get story by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/stories/${storyId}`)
        .expect(200);

      expect(response.body.id).toBe(storyId);
      expect(response.body).toHaveProperty('tags');
      expect(response.body).toHaveProperty('categories');
    });

    it('should return 404 for non-existent story', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/stories/99999')
        .expect(404);
    });
  });

  describe('PATCH /api/v1/stories/:id', () => {
    let storyId: number;

    beforeEach(async () => {
      const storyPayload = StoryFactory.create({
        title: 'Story to Update',
        details: 'Initial details',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(storyPayload);

      if (response.status !== 201) {
        throw new Error(`Failed to create story for delete tests: ${response.status} ${JSON.stringify(response.body)}`);
      }

      storyId = response.body.id;
    });

    it('should update story', async () => {
      const updatedData = {
        title: 'Updated Title',
        details: 'Updated details',
      };

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe(updatedData.title);
      expect(response.body.details).toBe(updatedData.details);
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/stories/${storyId}`)
        .send({ title: 'Updated' })
        .expect(401);
    });
  });

  describe('DELETE /api/v1/stories/:id', () => {
    let storyId: number;

    beforeEach(async () => {
      const storyPayload = StoryFactory.create({
        title: 'Story to Delete',
        details: 'Please delete this story',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/stories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(storyPayload);

      if (response.status !== 201) {
        throw new Error(`Failed to create story for delete tests: ${response.status} ${JSON.stringify(response.body)}`);
      }

      storyId = response.body.id;
    });

    it('should soft delete story', async () => {
      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/v1/stories/${storyId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(deleteResponse.status).toBe(204);

      const storyRepository = dataSource.getRepository(Story);
      const story = await storyRepository.findOne({ where: { id: storyId } });
      
      expect(story?.deletedAt).toBeTruthy();
    });

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/stories/${storyId}`)
        .expect(401);
    });
  });

  describe('Cache Integration', () => {
    it('should cache story list results', async () => {
      // First request - cache miss
      const response1 = await request(app.getHttpServer())
        .get('/api/v1/stories')
        .expect(200);

      // Second request - should be from cache (faster)
      const startTime = Date.now();
      const response2 = await request(app.getHttpServer())
        .get('/api/v1/stories')
        .expect(200);
      const duration = Date.now() - startTime;

      // Results should be identical
      expect(response1.body).toEqual(response2.body);
      
      // Second request should be fast (< 50ms from cache)
      expect(duration).toBeLessThan(50);
    });
  });
});
