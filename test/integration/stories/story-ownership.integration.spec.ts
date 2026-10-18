/**
 * Story ownership (regular users, real ACL permissions)
 *
 * The 'user' role may update and delete only its own stories (a CASL condition on
 * userId). These tests run without overriding AbilityGuard and with a cache that
 * returns plain JSON, like Redis, which the super-admin specs cannot catch.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ENTITIES } from '@app/database/entities'
import { LoggerModule } from 'nestjs-pino'
import request from 'supertest'
import { DataSource } from 'typeorm'

import { AclModule } from '@modules/acl/acl.module'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { AuthModule } from '@modules/auth/auth.module'
import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'
import { User } from '@modules/users/entities/user.entity'
import { UsersModule } from '@modules/users/users.module'

import { CacheService } from '@core/cache/services/cache.service'
import { EventsModule } from '@core/events'
import { LoggingModule } from '@core/logging/logging.module'
import { SentryModule } from '@core/sentry'

import { StoryFactory } from '../../factories/story.factory'
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

describe('Story ownership (regular users)', () => {
  let app: INestApplication
  let dataSource: DataSource
  let cache: InMemoryCacheService
  let owner: { user: User; token: string }
  let other: { user: User; token: string }
  let story: Story

  const http = () => request(app.getHttpServer())

  beforeAll(async () => {
    cache = new InMemoryCacheService()
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
        StoriesModule,
        TagsModule,
        AuthModule,
        UsersModule
      ]
    })
      .overrideProvider(CacheService)
      .useValue(cache)
      .compile()

    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
    dataSource = app.get(DataSource)

    await resetDatabase(dataSource, TABLES)
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
      return { user, token: login.body.accessToken as string }
    }
    owner = await signUp('owner@test-ownership.com')
    other = await signUp('other@test-ownership.com')
  })

  beforeEach(async () => {
    await cache.reset()
    // DELETE, not TRUNCATE ... CASCADE: users reference attachments (profile image)
    await dataSource.query('DELETE FROM stories')
    await dataSource.query('DELETE FROM attachments')
    story = await dataSource
      .getRepository(Story)
      .save(StoryFactory.create({ userId: owner.user.id, createdBy: owner.user.id }) as Story)

    // Read it once so later lookups are cache hits (plain objects, as from Redis)
    await http()
      .get(`/api/v1/stories/${story.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)
  })

  afterAll(async () => {
    await resetDatabase(dataSource, TABLES)
    await app.close()
  })

  describe('PATCH /stories/:id', () => {
    it('lets the owner update their story when it comes from the cache', async () => {
      await http()
        .patch(`/api/v1/stories/${story.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Edited by owner' })
        .expect(200)
    })

    it("rejects another user's update", async () => {
      await http()
        .patch(`/api/v1/stories/${story.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ title: 'Hijacked' })
        .expect(403)
    })
  })

  describe('main image', () => {
    const imageOf = (user: User) =>
      dataSource.getRepository(Attachment).save({
        userId: user.id,
        path: `uploads/${user.id}/cover.png`,
        originalName: 'cover.png',
        mimeType: 'image/png',
        size: 1024,
        isPublic: true
      })

    it("rejects setting your own image on another user's story", async () => {
      const image = await imageOf(other.user)

      await http()
        .put(`/api/v1/stories/${story.id}/main-image`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ attachmentId: image.id })
        .expect(403)

      const stored = await dataSource.getRepository(Story).findOneByOrFail({ id: story.id })
      expect(stored.mainImageId).toBeNull()
    })

    it("rejects removing another user's main image", async () => {
      const image = await imageOf(owner.user)
      await dataSource.getRepository(Story).update(story.id, { mainImageId: image.id })
      await cache.reset()

      await http()
        .delete(`/api/v1/stories/${story.id}/main-image`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403)

      const stored = await dataSource.getRepository(Story).findOneByOrFail({ id: story.id })
      expect(stored.mainImageId).toBe(image.id)
    })

    it('lets the owner set and remove the main image', async () => {
      const image = await imageOf(owner.user)

      await http()
        .put(`/api/v1/stories/${story.id}/main-image`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ attachmentId: image.id })
        .expect(200)
      await http()
        .delete(`/api/v1/stories/${story.id}/main-image`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200)
    })
  })

  describe('DELETE /stories/:id', () => {
    it("rejects deleting another user's story", async () => {
      await http()
        .delete(`/api/v1/stories/${story.id}`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403)
    })

    it('lets the owner delete their story', async () => {
      await http()
        .delete(`/api/v1/stories/${story.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(204)

      const stored = await dataSource.getRepository(Story).findOneByOrFail({ id: story.id })
      expect(stored.status).toBe(StoryStatus.DELETED)
    })
  })
})
