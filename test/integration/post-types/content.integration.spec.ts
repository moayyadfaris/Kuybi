/**
 * Content Integration Tests
 * Tests POST /api/content/:postTypeSlug CRUD operations with field validation
 */

import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import * as request from 'supertest'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'

import { PostTypesModule } from '@modules/post-types/post-types.module'
import { AuthModule } from '@modules/auth/auth.module'
import { UsersModule } from '@modules/users/users.module'
import { AclModule } from '@modules/acl/acl.module'

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

import { seedDefaultRoles, SeededRoles } from '../../helpers/role-seeder'
import { TestRedis } from '../../helpers/test-redis'
import { UserFactory } from '../../factories/user.factory'
import { testConfig } from '../../test.config'
import { CacheService } from '@core/cache/services/cache.service'

const createInMemoryCacheService = () => {
  const store = new Map<string, any>()
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: any) => store.set(key, value),
    del: async (key: string) => store.delete(key),
    delPattern: async (pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      for (const key of store.keys()) {
        if (regex.test(key)) store.delete(key)
      }
    },
    reset: async () => store.clear(),
    wrap: async (key: string, fn: () => Promise<any>) => {
      if (store.has(key)) return store.get(key)
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

describe('Content Integration Tests', () => {
  let app: INestApplication
  let dataSource: DataSource
  let adminUser: User
  let editorUser: User
  let adminToken: string
  let editorToken: string
  let regularToken: string
  let testCounter = 0
  let cacheStub: ReturnType<typeof createInMemoryCacheService>
  let roles: SeededRoles
  let postTypeId: string
  const postTypeSlug = 'product'

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
          pinoHttp: { level: 'silent' }
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

    const newAdmin = await UserFactory.createWithHashedPassword({
      email: `admin${testCounter}@example.com`,
      name: 'Admin User',
      primaryRoleId: roles['super-admin'].id,
      password: ADMIN_PASSWORD
    })
    adminUser = await userRepository.save(newAdmin as User)

    const newEditor = await UserFactory.createWithHashedPassword({
      email: `editor${testCounter}@example.com`,
      name: 'Editor User',
      primaryRoleId: roles['editor'].id,
      password: EDITOR_PASSWORD
    })
    editorUser = await userRepository.save(newEditor as User)

    const newUser = await UserFactory.createWithHashedPassword({
      email: `user${testCounter}@example.com`,
      name: 'Regular User',
      primaryRoleId: roles['user'].id,
      password: USER_PASSWORD
    })
    await userRepository.save(newUser as User)

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
      .send({ email: newUser.email, password: USER_PASSWORD })
    regularToken = userLogin.body.accessToken

    // Create post type
    const postTypeResponse = await request(app.getHttpServer())
      .post('/api/post-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Product',
        slug: postTypeSlug,
        description: 'Products',
        icon: 'shopping-cart',
        singularLabel: 'Product',
        pluralLabel: 'Products'
      })
    postTypeId = postTypeResponse.body.id

    // Create field definitions
    await request(app.getHttpServer())
      .post(`/api/post-types/${postTypeId}/fields`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'product_name',
        label: 'Product Name',
        fieldType: 'text',
        isRequired: true,
        displayOrder: 1,
        validationRules: { minLength: 3, maxLength: 100 }
      })

    await request(app.getHttpServer())
      .post(`/api/post-types/${postTypeId}/fields`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'price',
        label: 'Price',
        fieldType: 'currency',
        isRequired: true,
        displayOrder: 2,
        validationRules: { min: 0, decimals: 2 }
      })

    await request(app.getHttpServer())
      .post(`/api/post-types/${postTypeId}/fields`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'description',
        label: 'Description',
        fieldType: 'textarea',
        isRequired: false,
        displayOrder: 3
      })

    await request(app.getHttpServer())
      .post(`/api/post-types/${postTypeId}/fields`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'email',
        label: 'Contact Email',
        fieldType: 'email',
        isRequired: false,
        displayOrder: 4
      })
  })

  afterAll(async () => {
    if (app) await app.close()
    await TestRedis.closeConnection()
  })

  describe('POST /api/content/:postTypeSlug', () => {
    const validContent = {
      title: 'iPhone 15 Pro',
      excerpt: 'Latest iPhone model',
      field_data: {
        product_name: 'iPhone 15 Pro',
        price: 999.99,
        description: 'The most advanced iPhone ever'
      }
    }

    it('should create content with valid field data', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send(validContent)
        .expect(201)

      expect(response.body).toMatchObject({
        title: 'iPhone 15 Pro',
        excerpt: 'Latest iPhone model',
        status: 'draft'
      })
      expect(response.body.fieldData).toMatchObject({
        product_name: 'iPhone 15 Pro',
        price: 999.99
      })
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .send(validContent)
        .expect(401)
    })

    it('should fail with regular user token', async () => {
      await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(validContent)
        .expect(403)
    })

    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test Product',
          field_data: {
            // Missing required: product_name, price
            description: 'Some description'
          }
        })
        .expect(400)

      expect(response.body.message).toContain('validation')
      expect(response.body.errors).toBeDefined()
      expect(response.body.errors.some((e: any) => e.fieldName === 'product_name')).toBe(true)
      expect(response.body.errors.some((e: any) => e.fieldName === 'price')).toBe(true)
    })

    it('should validate text field min length', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test',
          field_data: {
            product_name: 'ab', // Too short (min: 3)
            price: 100
          }
        })
        .expect(400)

      expect(response.body.errors).toBeDefined()
      const nameError = response.body.errors.find((e: any) => e.fieldName === 'product_name')
      expect(nameError.errorCode).toBe('MIN_LENGTH')
    })

    it('should validate text field max length', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test',
          field_data: {
            product_name: 'a'.repeat(101), // Too long (max: 100)
            price: 100
          }
        })
        .expect(400)

      const nameError = response.body.errors.find((e: any) => e.fieldName === 'product_name')
      expect(nameError.errorCode).toBe('MAX_LENGTH')
    })

    it('should validate currency field min value', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test',
          field_data: {
            product_name: 'Test Product',
            price: -10 // Below min (0)
          }
        })
        .expect(400)

      const priceError = response.body.errors.find((e: any) => e.fieldName === 'price')
      expect(priceError.errorCode).toBe('MIN_VALUE')
    })

    it('should validate email format', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test',
          field_data: {
            product_name: 'Test Product',
            price: 100,
            email: 'not-an-email'
          }
        })
        .expect(400)

      const emailError = response.body.errors.find((e: any) => e.fieldName === 'email')
      expect(emailError.errorCode).toBe('INVALID_EMAIL')
    })

    it('should reject unknown fields', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test',
          field_data: {
            product_name: 'Test Product',
            price: 100,
            unknown_field: 'value'
          }
        })
        .expect(400)

      const unknownError = response.body.errors.find((e: any) => e.fieldName === 'unknown_field')
      expect(unknownError.errorCode).toBe('UNKNOWN_FIELD')
    })

    it('should allow optional fields to be omitted', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test',
          field_data: {
            product_name: 'Test Product',
            price: 100
            // description and email omitted (optional)
          }
        })
        .expect(201)

      expect(response.body.fieldData).toMatchObject({
        product_name: 'Test Product',
        price: 100
      })
    })

    it('should generate slug from title if not provided', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'iPhone 15 Pro Max',
          field_data: {
            product_name: 'iPhone 15 Pro Max',
            price: 1199
          }
        })
        .expect(201)

      expect(response.body.slug).toBeDefined()
      expect(response.body.slug).toMatch(/^iphone-15-pro-max/)
    })
  })

  describe('GET /api/content/:postTypeSlug', () => {
    beforeEach(async () => {
      // Create test content
      await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Product 1',
          field_data: { product_name: 'Product 1', price: 100 },
          status: 'published'
        })

      await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Product 2',
          field_data: { product_name: 'Product 2', price: 200 },
          status: 'draft'
        })
    })

    it('should list content for post type', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/content/${postTypeSlug}`)
        .expect(200)

      expect(response.body.data).toBeDefined()
      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.total).toBeDefined()
    })

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/content/${postTypeSlug}?status=published`)
        .expect(200)

      expect(response.body.data.length).toBe(1)
      expect(response.body.data[0].status).toBe('published')
    })

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/content/${postTypeSlug}?limit=1&offset=0`)
        .expect(200)

      expect(response.body.data.length).toBe(1)
    })

    it('should support search', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/content/${postTypeSlug}?search=Product 1`)
        .expect(200)

      expect(response.body.data.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/content/:postTypeSlug/:id', () => {
    let contentId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test Product',
          field_data: { product_name: 'Test Product', price: 100 }
        })
      contentId = createResponse.body.id
    })

    it('should get content by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/content/${postTypeSlug}/${contentId}`)
        .expect(200)

      expect(response.body.id).toBe(contentId)
      expect(response.body.title).toBe('Test Product')
    })

    it('should return 404 for non-existent ID', async () => {
      await request(app.getHttpServer())
        .get(`/api/content/${postTypeSlug}/00000000-0000-0000-0000-000000000000`)
        .expect(404)
    })
  })

  describe('PATCH /api/content/:postTypeSlug/:id', () => {
    let contentId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test Product',
          field_data: {
            product_name: 'Test Product',
            price: 100,
            description: 'Original description'
          }
        })
      contentId = createResponse.body.id
    })

    it('should update content with valid data', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/content/${postTypeSlug}/${contentId}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Updated Product',
          field_data: {
            price: 150,
            description: 'Updated description'
          }
        })
        .expect(200)

      expect(response.body.title).toBe('Updated Product')
      expect(response.body.fieldData.price).toBe(150)
      expect(response.body.fieldData.description).toBe('Updated description')
    })

    it('should validate updated field data', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/content/${postTypeSlug}/${contentId}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          field_data: {
            price: -50 // Invalid: below min
          }
        })
        .expect(400)

      const priceError = response.body.errors.find((e: any) => e.fieldName === 'price')
      expect(priceError.errorCode).toBe('MIN_VALUE')
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/api/content/${postTypeSlug}/${contentId}`)
        .send({ title: 'Updated' })
        .expect(401)
    })
  })

  describe('POST /api/content/:postTypeSlug/:id/publish', () => {
    let contentId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test Product',
          field_data: { product_name: 'Test Product', price: 100 },
          status: 'draft'
        })
      contentId = createResponse.body.id
    })

    it('should publish content', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}/${contentId}/publish`)
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(200)

      expect(response.body.status).toBe('published')
      expect(response.body.publishedAt).toBeDefined()
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}/${contentId}/publish`)
        .expect(401)
    })
  })

  describe('POST /api/content/:postTypeSlug/:id/schedule', () => {
    let contentId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test Product',
          field_data: { product_name: 'Test Product', price: 100 }
        })
      contentId = createResponse.body.id
    })

    it('should schedule content for future date', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)

      const response = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}/${contentId}/schedule`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          scheduledFor: futureDate.toISOString()
        })
        .expect(200)

      expect(response.body.status).toBe('scheduled')
      expect(response.body.scheduledAt).toBeDefined()
    })

    it('should fail for past date', async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)

      await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}/${contentId}/schedule`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          scheduledFor: pastDate.toISOString()
        })
        .expect(400)
    })
  })

  describe('DELETE /api/content/:postTypeSlug/:id', () => {
    let contentId: string

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post(`/api/content/${postTypeSlug}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Test Product',
          field_data: { product_name: 'Test Product', price: 100 }
        })
      contentId = createResponse.body.id
    })

    it('should soft delete content', async () => {
      await request(app.getHttpServer())
        .delete(`/api/content/${postTypeSlug}/${contentId}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(204)

      await request(app.getHttpServer())
        .get(`/api/content/${postTypeSlug}/${contentId}`)
        .expect(404)
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/api/content/${postTypeSlug}/${contentId}`)
        .expect(401)
    })
  })
})
