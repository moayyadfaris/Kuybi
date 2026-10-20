/**
 * Post Types Integration Tests
 * Tests POST /api/post-types CRUD operations with authentication and authorization
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

import { AclModule } from '@modules/acl/acl.module'
import { AuthModule } from '@modules/auth/auth.module'
// Entities
import { PostType } from '@modules/post-types/entities/post-type.entity'
// Modules
import { PostTypesModule } from '@modules/post-types/post-types.module'
import { User } from '@modules/users/entities/user.entity'
import { UsersModule } from '@modules/users/users.module'

import { CacheService } from '@core/cache/services/cache.service'
import { EventsModule } from '@core/events'
import { SentryModule } from '@core/sentry'

import { UserFactory } from '../../factories/user.factory'
import { InMemoryCacheService } from '../../helpers/in-memory-cache.service'
import { resetDatabase } from '../../helpers/reset-database'
// Helpers
import { SeededRoles, seedRolesWithPermissions } from '../../helpers/role-seeder'
import { TestRedis } from '../../helpers/test-redis'
import { testConfig } from '../../test.config'

const TABLES_TO_TRUNCATE = [
  'post_content_attachments',
  'post_content_tags',
  'post_content_categories',
  'post_content',
  'field_definitions',
  'post_types',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Post Types Integration Tests', () => {
  let app: INestApplication
  let dataSource: DataSource
  let adminUser: User
  let regularUser: User
  let adminToken: string
  let regularToken: string
  let testCounter = 0
  let cacheStub: InMemoryCacheService
  let roles: SeededRoles

  const ADMIN_PASSWORD = 'Admin@123'
  const EDITOR_PASSWORD = 'Editor@123'
  const USER_PASSWORD = 'User@123'

  beforeAll(async () => {
    await TestRedis.createConnection()

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
          dropSchema: false,
          logging: false
        }),
        PostTypesModule,
        AuthModule,
        UsersModule,
        AclModule
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

    await resetDatabase(dataSource, TABLES_TO_TRUNCATE)

    await TestRedis.clearCache()
    await cacheStub.reset()

    roles = await seedRolesWithPermissions(dataSource)

    const userRepository = dataSource.getRepository(User)

    // Create admin user
    const newAdmin = await UserFactory.createWithHashedPassword({
      email: `admin${testCounter}@example.com`,
      name: 'Admin User',
      primaryRoleId: roles['super-admin'].id,
      password: ADMIN_PASSWORD
    })
    adminUser = await userRepository.save(newAdmin as User)

    // Create editor user
    const newEditor = await UserFactory.createWithHashedPassword({
      email: `editor${testCounter}@example.com`,
      name: 'Editor User',
      primaryRoleId: roles['moderator'].id,
      password: EDITOR_PASSWORD
    })
    await userRepository.save(newEditor as User)

    // Create regular user
    const newUser = await UserFactory.createWithHashedPassword({
      email: `user${testCounter}@example.com`,
      name: 'Regular User',
      primaryRoleId: roles['user'].id,
      password: USER_PASSWORD
    })
    regularUser = await userRepository.save(newUser as User)

    // Get tokens
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminUser.email, password: ADMIN_PASSWORD })
    adminToken = adminLogin.body.data.accessToken

    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: regularUser.email, password: USER_PASSWORD })
    regularToken = userLogin.body.data.accessToken
  })

  afterAll(async () => {
    if (app) {
      await app.close()
    }
    await TestRedis.closeConnection()
  })

  describe('POST /api/post-types', () => {
    const validPostType = {
      name: 'Product',
      slug: 'product',
      description: 'Product post type',
      icon: 'shopping-cart',
      singularLabel: 'Product',
      pluralLabel: 'Products',
      isSystem: false,
      isActive: true,
      supportsRevisions: true,
      supportsComments: false,
      supportsAttachments: true,
      supportsTags: true,
      supportsCategories: true,
      menuPosition: 10
    }

    it('should create post type with admin token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPostType)
        .expect(201)

      expect(response.body.data).toMatchObject({
        name: validPostType.name,
        slug: validPostType.slug,
        description: validPostType.description,
        isSystem: false,
        isActive: true
      })
      expect(response.body.data).toHaveProperty('id')
      expect(response.body.data).toHaveProperty('createdAt')
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer()).post('/api/v1/post-types').send(validPostType).expect(401)
    })

    it('should fail with regular user token (insufficient permissions)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(validPostType)
        .expect(403)
    })

    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product'
          // Missing required fields
        })
        .expect(400)

      expect(response.body.error.message).toEqual(
        expect.arrayContaining([expect.stringContaining('singularLabel')])
      )
    })

    it('should ignore a client-supplied slug and generate it from the name', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validPostType,
          slug: 'Invalid-Slug'
        })
        .expect(201)

      expect(response.body.data.slug).toBe('product')
    })

    it('should generate a transliterated slug for an Arabic name', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validPostType,
          name: 'مقالات',
          singularLabel: 'مقالة',
          pluralLabel: 'مقالات'
        })
        .expect(201)

      expect(response.body.data.name).toBe('مقالات')
      expect(response.body.data.slug).toBe('mqalat')
    })

    it('should suffix the slug when different names produce the same slug', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPostType, name: 'Blog Post' })
        .expect(201)

      const response = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validPostType, name: 'blog_post' })
        .expect(201)

      expect(response.body.data.slug).toBe('blog-post-2')
    })

    it('should reject a duplicate name with 409', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPostType)
        .expect(201)

      const response = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPostType)
        .expect(409)

      expect(response.body.error.message).toContain('already exists')
    })
  })

  describe('GET /api/post-types', () => {
    beforeEach(async () => {
      // Create test post types
      await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product',
          slug: 'product',
          description: 'Products',
          icon: 'shopping-cart',
          singularLabel: 'Product',
          pluralLabel: 'Products',
          isActive: true
        })

      const eventResponse = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Event',
          description: 'Events',
          icon: 'calendar',
          singularLabel: 'Event',
          pluralLabel: 'Events'
        })

      // isActive is not accepted on create; deactivate via update
      await request(app.getHttpServer())
        .patch(`/api/v1/post-types/${eventResponse.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200)
    })

    it('should list all active post types (no auth required)', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/post-types').expect(200)

      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.data.length).toBe(1)
      expect(response.body.data[0].slug).toBe('product')
    })

    it('should list inactive post types to those who manage them', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/post-types?includeInactive=true')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.data.length).toBe(2)
    })
  })

  describe('GET /api/post-types/:id', () => {
    let postTypeId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product',
          slug: 'product',
          description: 'Products',
          icon: 'shopping-cart',
          singularLabel: 'Product',
          pluralLabel: 'Products'
        })
      postTypeId = createResponse.body.data.id
    })

    it('should get post type by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/post-types/${postTypeId}`)
        .expect(200)

      expect(response.body.data.id).toBe(postTypeId)
      expect(response.body.data.slug).toBe('product')
    })

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/post-types/00000000-0000-0000-0000-000000000000')
        .expect(404)
    })
  })

  describe('GET /api/post-types/slug/:slug', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product',
          slug: 'product',
          description: 'Products',
          icon: 'shopping-cart',
          singularLabel: 'Product',
          pluralLabel: 'Products'
        })
    })

    it('should get post type by slug', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/post-types/slug/product')
        .expect(200)

      expect(response.body.data.slug).toBe('product')
      expect(response.body.data.name).toBe('Product')
    })

    it('should return 404 for non-existent slug', async () => {
      await request(app.getHttpServer()).get('/api/v1/post-types/slug/nonexistent').expect(404)
    })
  })

  describe('PATCH /api/post-types/:id', () => {
    let postTypeId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product',
          slug: 'product',
          description: 'Products',
          icon: 'shopping-cart',
          singularLabel: 'Product',
          pluralLabel: 'Products'
        })
      postTypeId = createResponse.body.data.id
    })

    it('should update post type with admin token', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/post-types/${postTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated description',
          menuPosition: 20
        })
        .expect(200)

      expect(response.body.data.description).toBe('Updated description')
      expect(response.body.data.menuPosition).toBe(20)
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/post-types/${postTypeId}`)
        .send({ description: 'Updated' })
        .expect(401)
    })

    it('should prevent updating slug', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/post-types/${postTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slug: 'new_slug' })
        .expect(200)

      // Slug should remain unchanged
      expect(response.body.data.slug).toBe('product')
    })
  })

  describe('DELETE /api/post-types/:id', () => {
    let postTypeId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product',
          slug: 'product',
          description: 'Products',
          icon: 'shopping-cart',
          singularLabel: 'Product',
          pluralLabel: 'Products',
          isSystem: false
        })
      postTypeId = createResponse.body.data.id
    })

    it('should soft delete post type with admin token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/post-types/${postTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204)

      // Verify soft delete
      await request(app.getHttpServer()).get(`/api/v1/post-types/${postTypeId}`).expect(404)
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/post-types/${postTypeId}`).expect(401)
    })

    it('should prevent deleting system post types', async () => {
      // Create system post type directly in database
      const postTypeRepo = dataSource.getRepository(PostType)
      const systemPostType = await postTypeRepo.save({
        name: 'System',
        slug: 'system',
        description: 'System type',
        icon: 'lock',
        singularLabel: 'System',
        pluralLabel: 'Systems',
        isSystem: true,
        createdBy: adminUser.id
      })

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/post-types/${systemPostType.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400)

      expect(response.body.error.message).toContain('system')
    })
  })
})
