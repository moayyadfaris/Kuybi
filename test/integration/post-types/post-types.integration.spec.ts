/**
 * Post Types Integration Tests
 * Tests POST /api/post-types CRUD operations with authentication and authorization
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import * as request from 'supertest'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'

// Modules
import { PostTypesModule } from '@modules/post-types/post-types.module'
import { AuthModule } from '@modules/auth/auth.module'
import { UsersModule } from '@modules/users/users.module'
import { AclModule } from '@modules/acl/acl.module'

// Entities
import { PostType } from '@modules/post-types/entities/post-type.entity'
import { FieldDefinition } from '@modules/post-types/entities/field-definition.entity'
import { PostContent } from '@modules/post-types/entities/post-content.entity'
import { PostContentAttachment } from '@modules/post-types/entities/post-content-attachment.entity'
import { PostContentTag } from '@modules/post-types/entities/post-content-tag.entity'
import { PostContentCategory } from '@modules/post-types/entities/post-content-category.entity'
import { User } from '@modules/users/entities/user.entity'
import { Session } from '@modules/auth/entities/session.entity'
import { UserRole } from '@modules/acl/entities/user-role.entity'
import { Role } from '@modules/acl/entities/role.entity'
import { Permission } from '@modules/acl/entities/permission.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { PasswordHistory } from '@modules/auth/entities/password-history.entity'

// Helpers
import { seedDefaultRoles, SeededRoles } from '../../helpers/role-seeder'
import { TestRedis } from '../../helpers/test-redis'
import { UserFactory } from '../../factories/user.factory'
import { testConfig } from '../../test.config'
import { CacheService } from '@core/cache/services/cache.service'

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
  'post_content_attachments',
  'post_content_tags',
  'post_content_categories',
  'post_contents',
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
  let editorUser: User
  let regularUser: User
  let adminToken: string
  let editorToken: string
  let regularToken: string
  let testCounter = 0
  let cacheStub: ReturnType<typeof createInMemoryCacheService>
  let roles: SeededRoles

  const ADMIN_PASSWORD = 'Admin@123'
  const EDITOR_PASSWORD = 'Editor@123'
  const USER_PASSWORD = 'User@123'

  beforeAll(async () => {
    await TestRedis.createConnection()

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
          database: process.env.TEST_DB_NAME,
          entities: [
            PostType,
            FieldDefinition,
            PostContent,
            PostContentAttachment,
            PostContentTag,
            PostContentCategory,
            User,
            Session,
            UserRole,
            Role,
            Permission,
            RolePermission,
            AuditLog,
            Attachment,
            PasswordHistory
          ],
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

    await dataSource.query(
      `TRUNCATE TABLE ${TABLES_TO_TRUNCATE.join(', ')} RESTART IDENTITY CASCADE`
    )

    await TestRedis.clearCache()
    await cacheStub.reset()

    roles = await seedDefaultRoles(dataSource)

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
      primaryRoleId: roles['editor'].id,
      password: EDITOR_PASSWORD
    })
    editorUser = await userRepository.save(newEditor as User)

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
    adminToken = adminLogin.body.accessToken

    const editorLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: editorUser.email, password: EDITOR_PASSWORD })
    editorToken = editorLogin.body.accessToken

    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: regularUser.email, password: USER_PASSWORD })
    regularToken = userLogin.body.accessToken
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
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPostType)
        .expect(201)

      expect(response.body).toMatchObject({
        name: validPostType.name,
        slug: validPostType.slug,
        description: validPostType.description,
        isSystem: false,
        isActive: true
      })
      expect(response.body).toHaveProperty('id')
      expect(response.body).toHaveProperty('createdAt')
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer()).post('/api/post-types').send(validPostType).expect(401)
    })

    it('should fail with regular user token (insufficient permissions)', async () => {
      await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(validPostType)
        .expect(403)
    })

    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product'
          // Missing required fields
        })
        .expect(400)

      expect(response.body.message).toContain('validation')
    })

    it('should validate slug format (snake_case)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validPostType,
          slug: 'Invalid-Slug'
        })
        .expect(400)

      expect(response.body.message).toContain('snake_case')
    })

    it('should prevent duplicate slugs', async () => {
      // Create first post type
      await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validPostType)
        .expect(201)

      // Try to create duplicate
      const response = await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validPostType,
          name: 'Different Name'
        })
        .expect(400)

      expect(response.body.message).toContain('already exists')
    })
  })

  describe('GET /api/post-types', () => {
    beforeEach(async () => {
      // Create test post types
      await request(app.getHttpServer())
        .post('/api/post-types')
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

      await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Event',
          slug: 'event',
          description: 'Events',
          icon: 'calendar',
          singularLabel: 'Event',
          pluralLabel: 'Events',
          isActive: false
        })
    })

    it('should list all active post types (no auth required)', async () => {
      const response = await request(app.getHttpServer()).get('/api/post-types').expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBe(1)
      expect(response.body[0].slug).toBe('product')
    })

    it('should list all post types including inactive with query param', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/post-types?includeInactive=true')
        .expect(200)

      expect(response.body.length).toBe(2)
    })
  })

  describe('GET /api/post-types/:id', () => {
    let postTypeId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product',
          slug: 'product',
          description: 'Products',
          icon: 'shopping-cart',
          singularLabel: 'Product',
          pluralLabel: 'Products'
        })
      postTypeId = createResponse.body.id
    })

    it('should get post type by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/post-types/${postTypeId}`)
        .expect(200)

      expect(response.body.id).toBe(postTypeId)
      expect(response.body.slug).toBe('product')
    })

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .get('/api/post-types/00000000-0000-0000-0000-000000000000')
        .expect(404)
    })
  })

  describe('GET /api/post-types/slug/:slug', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/post-types')
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
        .get('/api/post-types/slug/product')
        .expect(200)

      expect(response.body.slug).toBe('product')
      expect(response.body.name).toBe('Product')
    })

    it('should return 404 for non-existent slug', async () => {
      await request(app.getHttpServer()).get('/api/post-types/slug/nonexistent').expect(404)
    })
  })

  describe('PATCH /api/post-types/:id', () => {
    let postTypeId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Product',
          slug: 'product',
          description: 'Products',
          icon: 'shopping-cart',
          singularLabel: 'Product',
          pluralLabel: 'Products'
        })
      postTypeId = createResponse.body.id
    })

    it('should update post type with admin token', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/post-types/${postTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated description',
          menuPosition: 20
        })
        .expect(200)

      expect(response.body.description).toBe('Updated description')
      expect(response.body.menuPosition).toBe(20)
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/api/post-types/${postTypeId}`)
        .send({ description: 'Updated' })
        .expect(401)
    })

    it('should prevent updating slug', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/post-types/${postTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slug: 'new_slug' })
        .expect(200)

      // Slug should remain unchanged
      expect(response.body.slug).toBe('product')
    })
  })

  describe('DELETE /api/post-types/:id', () => {
    let postTypeId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/post-types')
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
      postTypeId = createResponse.body.id
    })

    it('should soft delete post type with admin token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/post-types/${postTypeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204)

      // Verify soft delete
      await request(app.getHttpServer()).get(`/api/post-types/${postTypeId}`).expect(404)
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer()).delete(`/api/post-types/${postTypeId}`).expect(401)
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
        .delete(`/api/post-types/${systemPostType.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400)

      expect(response.body.message).toContain('system')
    })
  })
})
