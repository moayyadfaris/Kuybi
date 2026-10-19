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
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { DirectUploadService } from '@modules/attachments/services/direct-upload.service'
import { S3Service } from '@modules/attachments/services/s3.service'
import { AuthModule } from '@modules/auth/auth.module'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'
import { User } from '@modules/users/entities/user.entity'
import { UsersModule } from '@modules/users/users.module'

import { CacheService } from '@core/cache/services/cache.service'
import { EventsModule } from '@core/events'
import { LoggingModule } from '@core/logging/logging.module'
import { OutboxMessage } from '@core/outbox'
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

// 1x1 PNG and the start of a PDF: real magic numbers for content verification
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n')

/** In-memory stand-in for S3: tests "upload" by putting bytes under the presigned key */
class FakeStorage {
  readonly objects = new Map<string, Buffer>()
  readonly publicKeys = new Set<string>()
  /** isPublic of each multipart upload, by key */
  readonly uploads = new Map<string, boolean | undefined>()

  install(s3: S3Service) {
    jest.spyOn(s3, 'createPresignedUpload').mockImplementation(async ({ key, contentType }) => ({
      url: 'https://storage.test/bucket',
      fields: { key, 'Content-Type': contentType, Policy: 'signed-policy' }
    }))
    jest.spyOn(s3, 'getMetadata').mockImplementation(async key => {
      const body = this.objects.get(key)
      if (!body) throw new Error('NotFound')
      return { contentLength: body.length }
    })
    jest
      .spyOn(s3, 'readHead')
      .mockImplementation(async (key, bytes) => this.objects.get(key)!.subarray(0, bytes))
    jest.spyOn(s3, 'delete').mockImplementation(async key => {
      this.objects.delete(key)
    })
    jest.spyOn(s3, 'upload').mockImplementation(async options => {
      this.uploads.set(options.key, options.isPublic)
      if (options.isPublic) this.publicKeys.add(options.key)
      return { key: options.key, bucket: 'bucket', location: `https://storage.test/${options.key}` }
    })
    // makePublic delegates to setAcl
    jest.spyOn(s3, 'setAcl').mockImplementation(async (key, isPublic) => {
      if (isPublic) this.publicKeys.add(key)
      else this.publicKeys.delete(key)
    })
  }
}

describe('Direct uploads', () => {
  let app: INestApplication
  let dataSource: DataSource
  let storage: FakeStorage
  let owner: { user: User; token: string }
  let other: { user: User; token: string }

  const http = () => request(app.getHttpServer())
  const as = (token: string) => ({ Authorization: `Bearer ${token}` })

  const initiate = (body: object, token = owner.token) =>
    http().post('/api/v1/attachments/uploads').set(as(token)).send(body)
  const complete = (id: string, token = owner.token) =>
    http().post(`/api/v1/attachments/uploads/${id}/complete`).set(as(token)).send()
  const stored = (id: string) => dataSource.getRepository(Attachment).findOneByOrFail({ id })

  /** Initiates an upload and "uploads" `bytes` to the returned key */
  const uploadAs = async (declared: object, bytes: Buffer) => {
    const response = await initiate(declared).expect(201)
    storage.objects.set(response.body.data.upload.fields.key, bytes)
    return response.body.data.attachmentId as string
  }

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
    configureApp(app)
    await app.init()
    dataSource = app.get(DataSource)
    storage = new FakeStorage()
    storage.install(app.get(S3Service))

    await resetDatabase(dataSource, TABLES)
    await dataSource.query('DELETE FROM outbox_messages')
    const roles = await seedRolesWithPermissions(dataSource)
    const signUp = async (email: string) => {
      const data = await UserFactory.createWithHashedPassword({
        email,
        password: PASSWORD,
        primaryRoleId: roles['user'].id
      })
      const user = await dataSource.getRepository(User).save(data as User)
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(201)
      return { user, token: login.body.data.accessToken as string }
    }
    owner = await signUp('owner@test-direct.com')
    other = await signUp('other@test-direct.com')
  })

  afterAll(async () => {
    await resetDatabase(dataSource, TABLES)
    await dataSource.query('DELETE FROM outbox_messages')
    await app.close()
  })

  const png = { originalName: 'pixel.png', mimeType: 'image/png', size: PNG.length }

  it('hands out a presigned POST and records a pending upload (public by default)', async () => {
    const response = await initiate(png).expect(201)

    expect(response.body.data.upload).toMatchObject({ method: 'POST', url: expect.any(String) })
    expect(response.body.data.upload.fields.key).toContain(owner.user.id)
    const attachment = await stored(response.body.data.attachmentId)
    expect(attachment).toMatchObject({ securityStatus: 'pending_upload', isPublic: true })
  })

  it('rejects disallowed types and oversized files before issuing a URL', async () => {
    await initiate({
      originalName: 'x.exe',
      mimeType: 'application/x-msdownload',
      size: 10
    }).expect(400)
    await initiate({ ...png, size: 101 * 1024 * 1024 }).expect(400)
  })

  it('answers 409 when the file has not been uploaded yet, and allows completing later', async () => {
    const response = await initiate(png).expect(201)
    const id = response.body.data.attachmentId

    await complete(id).expect(409)
    expect((await stored(id)).securityStatus).toBe('pending_upload')

    storage.objects.set(response.body.data.upload.fields.key, PNG)
    await complete(id).expect(200)
  })

  it('verifies an image, keeps it private, and queues processing with the outbox', async () => {
    const id = await uploadAs({ ...png, isPublic: true }, PNG)

    const response = await complete(id).expect(200)

    expect(response.body.data.id).toBe(id)
    const attachment = await stored(id)
    expect(attachment.securityStatus).toBe('processing')
    // Public only after processing has replaced it with an EXIF-stripped copy
    expect(storage.publicKeys.has(attachment.path)).toBe(false)
    const job = await dataSource
      .getRepository(OutboxMessage)
      .createQueryBuilder('m')
      .where("m.payload->>'attachmentId' = :id", { id })
      .getOneOrFail()
    expect(job).toMatchObject({ queue: 'attachment-processing-queue', jobName: 'process-image' })
  })

  it('makes a public non-image file public right away', async () => {
    const id = await uploadAs(
      { originalName: 'flyer.pdf', mimeType: 'application/pdf', size: PDF.length, isPublic: true },
      PDF
    )

    await complete(id).expect(200)

    const attachment = await stored(id)
    expect(attachment.securityStatus).toBe('completed')
    expect(storage.publicKeys.has(attachment.path)).toBe(true)
  })

  it('completes only once', async () => {
    const id = await uploadAs(png, PNG)

    await complete(id).expect(200)
    await complete(id).expect(409)
  })

  it('rejects and deletes a file whose content does not match the declared type', async () => {
    const id = await uploadAs({ ...png, size: PDF.length }, PDF) // a PDF declared as PNG

    const response = await complete(id).expect(422)

    expect(JSON.stringify(response.body.error)).toContain('application/pdf')
    const attachment = await stored(id)
    expect(attachment.securityStatus).toBe('rejected')
    expect(storage.objects.has(attachment.path)).toBe(false)
  })

  it('rejects a file of a different size than declared', async () => {
    const id = await uploadAs({ ...png, size: PNG.length + 10 }, PNG)

    await complete(id).expect(422)
    expect((await stored(id)).securityStatus).toBe('rejected')
  })

  it("does not let another user complete someone's upload", async () => {
    const id = await uploadAs(png, PNG)

    await complete(id, other.token).expect(404)
  })

  it('removes uploads that were never completed', async () => {
    const response = await initiate(png).expect(201)
    const id = response.body.data.attachmentId
    await dataSource.query(
      `UPDATE attachments SET "createdAt" = now() - interval '25 hours' WHERE id = $1`,
      [id]
    )

    await app.get(DirectUploadService).removeAbandonedUploads()

    expect(await dataSource.getRepository(Attachment).findOneBy({ id })).toBeNull()
  })

  describe('multipart upload (POST /attachments)', () => {
    // Unique bytes per upload: identical content is deduplicated to the existing row
    let n = 0
    const upload = (fields: Record<string, string>) => {
      const body = Buffer.concat([PDF, Buffer.from(`% ${Date.now()}-${++n}\n`)])
      const req = http()
        .post('/api/v1/attachments')
        .set(as(owner.token))
        .attach('file', body, { filename: 'payslip.pdf', contentType: 'application/pdf' })
      for (const [name, value] of Object.entries(fields)) req.field(name, value)
      return req
    }

    // Form fields are strings: implicit conversion used to turn "false" into true
    it('stores a file sent with isPublic=false as private', async () => {
      const res = await upload({ isPublic: 'false', async: 'false' }).expect(201)

      const attachment = await stored(res.body.data.attachment.id)
      expect(attachment.isPublic).toBe(false)
      expect(storage.uploads.get(attachment.path)).toBe(false)
      expect(res.body.data.processing).toBe('sync')
    })

    it('honours isPublic=true', async () => {
      const res = await upload({ isPublic: 'true' }).expect(201)

      expect((await stored(res.body.data.attachment.id)).isPublic).toBe(true)
    })
  })

  describe("visibility is the uploader's choice", () => {
    let n = 0
    const pdf = () => Buffer.concat([PDF, Buffer.from(`% visibility-${Date.now()}-${++n}\n`)])
    const upload = (body: Buffer, fields: Record<string, string> = {}) => {
      const req = http()
        .post('/api/v1/attachments')
        .set(as(owner.token))
        .attach('file', body, { filename: 'doc.pdf', contentType: 'application/pdf' })
      for (const [name, value] of Object.entries(fields)) req.field(name, value)
      return req
    }
    const setPublic = (id: string, isPublic: boolean) =>
      http().patch(`/api/v1/attachments/${id}`).set(as(owner.token)).send({ isPublic })

    it('defaults to public', async () => {
      const res = await upload(pdf()).expect(201)

      const attachment = await stored(res.body.data.attachment.id)
      expect(attachment.isPublic).toBe(true)
      expect(storage.publicKeys.has(attachment.path)).toBe(true)
    })

    it('switching to private changes the stored object too, and back', async () => {
      const { id } = (await upload(pdf()).expect(201)).body.data.attachment

      await setPublic(id, false).expect(200)
      let attachment = await stored(id)
      expect(attachment.isPublic).toBe(false)
      // The flag alone used to change: the object stayed publicly downloadable
      expect(storage.publicKeys.has(attachment.path)).toBe(false)

      await setPublic(id, true).expect(200)
      attachment = await stored(id)
      expect(attachment.isPublic).toBe(true)
      expect(storage.publicKeys.has(attachment.path)).toBe(true)
    })

    it('keeps profile images public', async () => {
      await upload(pdf(), { category: 'profile-image', isPublic: 'false' }).expect(400)
    })

    it('applies the requested visibility when the same file is uploaded again', async () => {
      const body = pdf()
      const first = (await upload(body).expect(201)).body.data.attachment

      // Both the sync and the async upload path deduplicate
      const again = (await upload(body, { isPublic: 'false', async: 'true' }).expect(201)).body.data
        .attachment

      expect(again.id).toBe(first.id) // deduplicated
      const attachment = await stored(first.id)
      expect(attachment.isPublic).toBe(false)
      expect(storage.publicKeys.has(attachment.path)).toBe(false)
    })
  })
})
