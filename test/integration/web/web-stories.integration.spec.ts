/**
 * Public web API integration tests
 *
 * /api/web/v1/* is reachable without authentication, so responses must only ever
 * contain fields that are safe to publish.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { DatabaseModule } from '@app/database/database.module'
import { LoggerModule } from 'nestjs-pino'
import request from 'supertest'
import { DataSource } from 'typeorm'

import { AbilityGuard } from '@modules/acl/abilities/ability.guard'
import { AclModule } from '@modules/acl/acl.module'
import { AuthModule } from '@modules/auth/auth.module'
import { Category } from '@modules/categories/entities/category.entity'
import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { Tag } from '@modules/tags/entities/tag.entity'
import { User } from '@modules/users/entities/user.entity'
import { UsersModule } from '@modules/users/users.module'
import { WebModule } from '@modules/web/web.module'

import { CacheService } from '@core/cache/services/cache.service'
import { EventsModule } from '@core/events'
import { LoggingModule } from '@core/logging/logging.module'

import { StoryFactory } from '../../factories/story.factory'
import { UserFactory } from '../../factories/user.factory'
import { InMemoryCacheService } from '../../helpers/in-memory-cache.service'
import { resetDatabase } from '../../helpers/reset-database'
import { seedDefaultRoles } from '../../helpers/role-seeder'
import { testConfig } from '../../test.config'

const TABLES = [
  'story_tags',
  'story_categories',
  'tags',
  'categories',
  'stories',
  'attachments',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

// Fields that must never appear for an author in any API response
const SECRET_USER_FIELDS = ['passwordHash']
// Additionally private on the public API
const PRIVATE_USER_FIELDS = [
  'email',
  'mobileNumber',
  'failedLoginAttempts',
  'lockedUntil',
  'lockedAt',
  'lockReason',
  'forcePasswordChange',
  'isLocked'
]
const PRIVATE_STORY_FIELDS = [
  'internalNotes',
  'deletionReason',
  'latitude',
  'longitude',
  'address',
  'createdBy',
  'updatedBy',
  'lastModifiedBy',
  'isInEditMode'
]
const PASSWORD = 'Password123!'

describe('Public web stories API', () => {
  let app: INestApplication
  let dataSource: DataSource
  let author: User
  let published: Story
  let draft: Story
  const cache = new InMemoryCacheService()

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        EventsModule,
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ...testConfig,
              database: { ...testConfig.database, name: testConfig.database.database }
            })
          ]
        }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
        DatabaseModule,
        LoggingModule,
        AclModule,
        StoriesModule,
        AuthModule,
        UsersModule,
        WebModule
      ]
    })
      .overrideProvider(CacheService)
      .useValue(cache)
      .overrideGuard(AbilityGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
    await app.init()
    dataSource = moduleFixture.get(DataSource)
  })

  afterAll(async () => {
    await app?.close()
  })

  beforeEach(async () => {
    await resetDatabase(dataSource, TABLES)
    // Story ids restart after TRUNCATE, so cached entries from a previous test would collide
    await cache.reset()
    const roles = await seedDefaultRoles(dataSource)

    author = await dataSource.getRepository(User).save(
      (await UserFactory.createWithHashedPassword({
        email: 'author@example.com',
        name: 'Story Author',
        mobileNumber: '+962790000000',
        password: PASSWORD,
        primaryRoleId: roles['super-admin'].id
      })) as User
    )

    const stories = dataSource.getRepository(Story)
    published = await stories.save(
      StoryFactory.create({
        userId: author.id,
        status: StoryStatus.PUBLISHED,
        title: 'Published story',
        internalNotes: 'staff only',
        latitude: 31.95,
        longitude: 35.91,
        address: '1 Private Street'
      }) as Story
    )
    draft = await stories.save(
      StoryFactory.create({ userId: author.id, status: StoryStatus.DRAFT }) as Story
    )
  })

  const expectNoFields = (obj: Record<string, unknown> | undefined, fields: string[]) => {
    for (const field of fields) {
      expect(obj).not.toHaveProperty(field)
    }
  }

  describe('GET /api/web/v1/stories', () => {
    it('lists only published stories', async () => {
      const res = await request(app.getHttpServer()).get('/api/web/v1/stories').expect(200)

      const ids = res.body.data.map((s: Story) => s.id)
      expect(ids).toContain(published.id)
      expect(ids).not.toContain(draft.id)
    })

    it('never exposes author credentials or private story fields', async () => {
      const res = await request(app.getHttpServer()).get('/api/web/v1/stories').expect(200)
      const story = res.body.data.find((s: Story) => s.id === published.id)

      expectNoFields(story, PRIVATE_STORY_FIELDS)
      expectNoFields(story.user, [...SECRET_USER_FIELDS, ...PRIVATE_USER_FIELDS])
      expect(story.user).toEqual({ id: author.id, name: 'Story Author' })
    })
  })

  describe('filters', () => {
    let tagged: Story

    beforeEach(async () => {
      const category = await dataSource.getRepository(Category).save({
        name: 'Technology',
        slug: 'technology',
        isActive: true,
        metadata: {}
      })
      const other = await dataSource.getRepository(Category).save({
        name: 'Culture',
        slug: 'culture',
        isActive: true,
        metadata: {}
      })
      const tags = dataSource.getRepository(Tag)
      const nodejs = await tags.save({ name: 'nodejs', createdBy: author.id })
      const ai = await tags.save({ name: 'ai', createdBy: author.id })

      tagged = await dataSource.getRepository(Story).save({
        ...(StoryFactory.create({
          userId: author.id,
          status: StoryStatus.PUBLISHED,
          title: 'Tagged story'
        }) as Story),
        categories: [category, other],
        tags: [nodejs, ai]
      })
    })

    const titles = (body: { data: Story[] }) => body.data.map(s => s.title).sort()

    it('filters by category slug without trimming the story categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/web/v1/stories?categorySlug=technology')
        .expect(200)

      expect(titles(res.body)).toEqual(['Tagged story'])
      expect(res.body.data[0].categories.map((c: Category) => c.slug).sort()).toEqual([
        'culture',
        'technology'
      ])
    })

    it('filters by tag name without trimming the story tags', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/web/v1/stories?tag=nodejs')
        .expect(200)

      expect(titles(res.body)).toEqual(['Tagged story'])
      expect(res.body.data[0].tags.map((t: Tag) => t.name).sort()).toEqual(['ai', 'nodejs'])
    })

    it('returns every published story when no filter is given', async () => {
      const res = await request(app.getHttpServer()).get('/api/web/v1/stories').expect(200)

      expect(titles(res.body)).toEqual(['Published story', 'Tagged story'])
      expect(res.body.total).toBe(2)
    })

    it('returns no stories for an unknown category', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/web/v1/stories?categorySlug=does-not-exist')
        .expect(200)

      expect(res.body.data).toEqual([])
      expect(tagged.id).toBeDefined()
    })
  })

  describe('GET /api/web/v1/stories/:id', () => {
    it('returns a published story without private fields', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/web/v1/stories/${published.id}`)
        .expect(200)

      expect(res.body.title).toBe('Published story')
      expectNoFields(res.body, PRIVATE_STORY_FIELDS)
      expectNoFields(res.body.user, [...SECRET_USER_FIELDS, ...PRIVATE_USER_FIELDS])
    })

    it('returns 404 for a story that is not published', async () => {
      await request(app.getHttpServer()).get(`/api/web/v1/stories/${draft.id}`).expect(404)
    })
  })

  describe('authenticated story API', () => {
    it('identifies the author without exposing credentials or contact details', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: author.email, password: PASSWORD })
        .expect(201)

      const res = await request(app.getHttpServer())
        .get(`/api/v1/stories/${published.id}`)
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200)

      expect(res.body.user).toEqual({ id: author.id, name: 'Story Author' })
      expectNoFields(res.body.user, [...SECRET_USER_FIELDS, ...PRIVATE_USER_FIELDS])
    })
  })
})
