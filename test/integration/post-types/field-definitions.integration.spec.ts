/**
 * Field Definitions Integration Tests
 * Tests POST /api/post-types/:postTypeId/fields CRUD operations
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

describe('Field Definitions Integration Tests', () => {
  let app: INestApplication
  let dataSource: DataSource
  let adminUser: User
  let adminToken: string
  let regularToken: string
  let testCounter = 0
  let cacheStub: ReturnType<typeof createInMemoryCacheService>
  let roles: SeededRoles
  let postTypeId: string

  const ADMIN_PASSWORD = 'Admin@123'
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

    const userLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: newUser.email, password: USER_PASSWORD })
    regularToken = userLogin.body.accessToken

    // Create a post type for testing
    const postTypeResponse = await request(app.getHttpServer())
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
    postTypeId = postTypeResponse.body.id
  })

  afterAll(async () => {
    if (app) await app.close()
    await TestRedis.closeConnection()
  })

  describe('POST /api/post-types/:postTypeId/fields', () => {
    const validField = {
      name: 'price',
      label: 'Price',
      fieldType: 'currency',
      description: 'Product price',
      isRequired: true,
      displayOrder: 1,
      validationRules: {
        min: 0,
        decimals: 2
      }
    }

    it('should create field definition with admin token', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validField)
        .expect(201)

      expect(response.body).toMatchObject({
        name: 'price',
        label: 'Price',
        fieldType: 'currency',
        isRequired: true
      })
      expect(response.body).toHaveProperty('id')
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .send(validField)
        .expect(401)
    })

    it('should fail with regular user token', async () => {
      await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(validField)
        .expect(403)
    })

    it('should validate field name format (snake_case)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validField,
          name: 'InvalidName'
        })
        .expect(400)

      expect(response.body.message).toContain('snake_case')
    })

    it('should validate field type is valid enum', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validField,
          fieldType: 'invalid_type'
        })
        .expect(400)

      expect(response.body.message).toContain('fieldType')
    })

    it('should prevent duplicate field names in same post type', async () => {
      // Create first field
      await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validField)
        .expect(201)

      // Try duplicate
      const response = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validField,
          label: 'Different Label'
        })
        .expect(400)

      expect(response.body.message).toContain('already exists')
    })

    it('should create field with all 25 field types', async () => {
      const fieldTypes = [
        'text',
        'textarea',
        'wysiwyg',
        'email',
        'url',
        'tel',
        'code',
        'number',
        'currency',
        'date',
        'datetime',
        'time',
        'checkbox',
        'radio',
        'select',
        'multiselect',
        'toggle',
        'file',
        'image',
        'gallery',
        'video',
        'relation',
        'user',
        'taxonomy',
        'color',
        'json',
        'repeater',
        'group'
      ]

      for (const fieldType of fieldTypes) {
        const response = await request(app.getHttpServer())
          .post(`/api/post-types/${postTypeId}/fields`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: `field_${fieldType}`,
            label: `Field ${fieldType}`,
            fieldType,
            isRequired: false
          })
          .expect(201)

        expect(response.body.fieldType).toBe(fieldType)
      }
    })
  })

  describe('GET /api/post-types/:postTypeId/fields', () => {
    beforeEach(async () => {
      // Create multiple fields
      await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'price',
          label: 'Price',
          fieldType: 'currency',
          displayOrder: 2
        })

      await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'name',
          label: 'Name',
          fieldType: 'text',
          displayOrder: 1
        })
    })

    it('should list all fields for post type', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/post-types/${postTypeId}/fields`)
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBe(2)
    })

    it('should return fields in display order', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/post-types/${postTypeId}/fields`)
        .expect(200)

      expect(response.body[0].name).toBe('name')
      expect(response.body[1].name).toBe('price')
    })
  })

  describe('GET /api/post-types/:postTypeId/fields/:id', () => {
    let fieldId: string

    beforeEach(async () => {
      const fieldResponse = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'price',
          label: 'Price',
          fieldType: 'currency'
        })
      fieldId = fieldResponse.body.id
    })

    it('should get field by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/post-types/${postTypeId}/fields/${fieldId}`)
        .expect(200)

      expect(response.body.id).toBe(fieldId)
      expect(response.body.name).toBe('price')
    })

    it('should return 404 for field from different post type', async () => {
      // Create another post type
      const postType2Response = await request(app.getHttpServer())
        .post('/api/post-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Event',
          slug: 'event',
          description: 'Events',
          icon: 'calendar',
          singularLabel: 'Event',
          pluralLabel: 'Events'
        })

      await request(app.getHttpServer())
        .get(`/api/post-types/${postType2Response.body.id}/fields/${fieldId}`)
        .expect(404)
    })
  })

  describe('PATCH /api/post-types/:postTypeId/fields/:id', () => {
    let fieldId: string

    beforeEach(async () => {
      const fieldResponse = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'price',
          label: 'Price',
          fieldType: 'currency',
          isRequired: false
        })
      fieldId = fieldResponse.body.id
    })

    it('should update field with admin token', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/post-types/${postTypeId}/fields/${fieldId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          label: 'Product Price',
          isRequired: true,
          validationRules: { min: 0, max: 10000 }
        })
        .expect(200)

      expect(response.body.label).toBe('Product Price')
      expect(response.body.isRequired).toBe(true)
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .patch(`/api/post-types/${postTypeId}/fields/${fieldId}`)
        .send({ label: 'Updated' })
        .expect(401)
    })

    it('should prevent updating field name', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/post-types/${postTypeId}/fields/${fieldId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'new_name' })
        .expect(200)

      expect(response.body.name).toBe('price')
    })

    it('should prevent updating field type', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/post-types/${postTypeId}/fields/${fieldId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fieldType: 'text' })
        .expect(200)

      expect(response.body.fieldType).toBe('currency')
    })
  })

  describe('POST /api/post-types/:postTypeId/fields/reorder', () => {
    let field1Id: string
    let field2Id: string
    let field3Id: string

    beforeEach(async () => {
      const f1 = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'field1',
          label: 'Field 1',
          fieldType: 'text',
          displayOrder: 1
        })
      field1Id = f1.body.id

      const f2 = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'field2',
          label: 'Field 2',
          fieldType: 'text',
          displayOrder: 2
        })
      field2Id = f2.body.id

      const f3 = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'field3',
          label: 'Field 3',
          fieldType: 'text',
          displayOrder: 3
        })
      field3Id = f3.body.id
    })

    it('should reorder fields', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fieldOrders: [
            { id: field3Id, displayOrder: 1 },
            { id: field1Id, displayOrder: 2 },
            { id: field2Id, displayOrder: 3 }
          ]
        })
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body[0].id).toBe(field3Id)
      expect(response.body[1].id).toBe(field1Id)
      expect(response.body[2].id).toBe(field2Id)
    })

    it('should fail with duplicate display orders', async () => {
      await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields/reorder`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fieldOrders: [
            { id: field1Id, displayOrder: 1 },
            { id: field2Id, displayOrder: 1 }
          ]
        })
        .expect(400)
    })
  })

  describe('DELETE /api/post-types/:postTypeId/fields/:id', () => {
    let fieldId: string

    beforeEach(async () => {
      const fieldResponse = await request(app.getHttpServer())
        .post(`/api/post-types/${postTypeId}/fields`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'price',
          label: 'Price',
          fieldType: 'currency'
        })
      fieldId = fieldResponse.body.id
    })

    it('should soft delete field with admin token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/post-types/${postTypeId}/fields/${fieldId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204)

      await request(app.getHttpServer())
        .get(`/api/post-types/${postTypeId}/fields/${fieldId}`)
        .expect(404)
    })

    it('should fail without authentication', async () => {
      await request(app.getHttpServer())
        .delete(`/api/post-types/${postTypeId}/fields/${fieldId}`)
        .expect(401)
    })
  })
})
