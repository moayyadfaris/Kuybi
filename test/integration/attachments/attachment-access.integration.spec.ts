import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ENTITIES } from '@app/database/entities'
import { LoggerModule } from 'nestjs-pino'
import request from 'supertest'
import { DataSource } from 'typeorm'

import { AclModule } from '@modules/acl/acl.module'
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { AuthModule } from '@modules/auth/auth.module'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'
import { User } from '@modules/users/entities/user.entity'
import { UsersModule } from '@modules/users/users.module'

import { CacheService } from '@core/cache/services/cache.service'
import { EventsModule } from '@core/events'
import { LoggingModule } from '@core/logging/logging.module'
import { SentryModule } from '@core/sentry'

import { UserFactory } from '../../factories/user.factory'
import { InMemoryCacheService } from '../../helpers/in-memory-cache.service'
import { resetDatabase } from '../../helpers/reset-database'
import { seedRolesWithPermissions } from '../../helpers/role-seeder'
import { testConfig } from '../../test.config'

const TABLES = [
  'stories',
  'tags',
  'categories',
  'attachments',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]
const PASSWORD = 'Password123!'

/**
 * Attachment access control
 *
 * Regular users read their own files and public ones; only roles with an unconditional
 * rule read other users' private files. Every route requires authentication.
 */
describe('Attachment access', () => {
  let app: INestApplication
  let dataSource: DataSource
  let owner: { user: User; token: string }
  let other: { user: User; token: string }
  let admin: { user: User; token: string }
  let privateFile: Attachment
  let publicFile: Attachment

  const http = () => request(app.getHttpServer())
  const as = (token: string) => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventsModule,
        SentryModule.forRoot(),
        ConfigModule.forRoot({ isGlobal: true, load: [() => testConfig] }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: testConfig.database.host,
          port: testConfig.database.port,
          username: testConfig.database.username,
          password: testConfig.database.password,
          database: testConfig.database.database,
          entities: ENTITIES,
          synchronize: false,
          logging: false
        }),
        LoggingModule,
        AclModule,
        AttachmentsModule,
        TagsModule,
        StoriesModule,
        AuthModule,
        UsersModule
      ]
    })
      .overrideProvider(CacheService)
      .useValue(new InMemoryCacheService())
      .compile()

    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
    dataSource = app.get(DataSource)

    await resetDatabase(dataSource, TABLES)
    const roles = await seedRolesWithPermissions(dataSource)

    const signUp = async (email: string, role: string) => {
      const data = await UserFactory.createWithHashedPassword({
        email,
        password: PASSWORD,
        primaryRoleId: roles[role].id
      })
      const user = await dataSource.getRepository(User).save(data as User)
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(201)
      return { user, token: login.body.accessToken as string }
    }
    owner = await signUp('owner@test-attachments.com', 'user')
    other = await signUp('other@test-attachments.com', 'user')
    admin = await signUp('admin@test-attachments.com', 'super-admin')

    const save = (isPublic: boolean) =>
      dataSource.getRepository(Attachment).save({
        userId: owner.user.id,
        path: `uploads/${owner.user.id}/${isPublic ? 'public' : 'private'}.pdf`,
        originalName: isPublic ? 'brochure.pdf' : 'payslip.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        isPublic
      })
    privateFile = await save(false)
    publicFile = await save(true)
  })

  afterAll(async () => {
    await resetDatabase(dataSource, TABLES)
    await app.close()
  })

  it('requires authentication on every route', async () => {
    const id = privateFile.id
    await http().get(`/api/v1/attachments/${id}`).expect(401)
    await http().get(`/api/v1/attachments/user/${owner.user.id}`).expect(401)
    await http().post(`/api/v1/attachments/${id}/presigned-url`).send({}).expect(401)
    await http().get(`/api/v1/attachments/${id}/download`).expect(401)
    await http().get('/api/v1/attachments/stats').expect(401)
    await http().post('/api/v1/attachments/cleanup-orphaned').expect(401)
    await http().get('/api/v1/attachments').expect(401)
  })

  it("hides another user's private file (404, not 403)", async () => {
    const id = privateFile.id
    await http().get(`/api/v1/attachments/${id}`).set(as(other.token)).expect(404)
    await http()
      .post(`/api/v1/attachments/${id}/presigned-url`)
      .set(as(other.token))
      .send({})
      .expect(404)
    await http().get(`/api/v1/attachments/${id}/download`).set(as(other.token)).expect(404)
  })

  it('lets other users read a public file and the owner read their private one', async () => {
    await http().get(`/api/v1/attachments/${publicFile.id}`).set(as(other.token)).expect(200)
    await http().get(`/api/v1/attachments/${privateFile.id}`).set(as(owner.token)).expect(200)
  })

  it('lets a super-admin read any file', async () => {
    await http().get(`/api/v1/attachments/${privateFile.id}`).set(as(admin.token)).expect(200)
  })

  it("shows other users only someone's public files in the list", async () => {
    const response = await http().get('/api/v1/attachments').set(as(other.token)).expect(200)
    const ids = response.body.data.map((a: { id: string }) => a.id)

    expect(ids).toContain(publicFile.id)
    expect(ids).not.toContain(privateFile.id)
  })

  it("forbids listing another user's files", async () => {
    await http().get(`/api/v1/attachments/user/${owner.user.id}`).set(as(other.token)).expect(403)
    await http().get(`/api/v1/attachments/user/${owner.user.id}`).set(as(owner.token)).expect(200)
  })

  it('keeps maintenance routes admin-only', async () => {
    await http().get('/api/v1/attachments/stats').set(as(other.token)).expect(403)
    await http().post('/api/v1/attachments/cleanup-orphaned').set(as(other.token)).expect(403)
    await http().get('/api/v1/attachments/stats').set(as(admin.token)).expect(200)
  })
})
