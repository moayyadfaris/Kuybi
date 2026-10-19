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
import { AuthModule } from '@modules/auth/auth.module'
import { PostContent } from '@modules/post-types/entities/post-content.entity'
import { PostType } from '@modules/post-types/entities/post-type.entity'
import { ContentStatus } from '@modules/post-types/enums/content-status.enum'
import { PostTypesModule } from '@modules/post-types/post-types.module'
import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import { StoryVersion } from '@modules/stories/entities/story-version.entity'
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
  'post_content',
  'post_types',
  'story_versions',
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
 * Authorization audit (October 2026): every case here was allowed before the fix.
 * Runs as real roles with the production ACL, no guard overrides.
 */
describe('Authorization audit', () => {
  let app: INestApplication
  let dataSource: DataSource
  let owner: Actor
  let other: Actor
  let moderator: Actor
  let admin: Actor
  let story: Story

  type Actor = { user: User; token: string }
  const http = () => request(app.getHttpServer())
  const as = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` })

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
        PostTypesModule,
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

    await resetDatabase(dataSource, TABLES)
    const roles = await seedRolesWithPermissions(dataSource)
    const signUp = async (email: string, role: string): Promise<Actor> => {
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
      return { user, token: login.body.data.accessToken }
    }
    owner = await signUp('owner@test-audit.com', 'user')
    other = await signUp('other@test-audit.com', 'user')
    moderator = await signUp('moderator@test-audit.com', 'moderator')
    admin = await signUp('admin@test-audit.com', 'super-admin')
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM story_versions')
    await dataSource.query('DELETE FROM stories')
    story = await dataSource
      .getRepository(Story)
      .save(StoryFactory.create({ userId: owner.user.id, createdBy: owner.user.id }) as Story)
  })

  afterAll(async () => {
    await resetDatabase(dataSource, TABLES)
    await app.close()
  })

  describe('story status needs Publish for editorial statuses', () => {
    const create = (actor: Actor, status?: StoryStatus) =>
      http()
        .post('/api/v1/stories')
        .set(as(actor))
        .send({ ...StoryFactory.create(), status })

    it('lets an author create drafts and submit for review, not publish', async () => {
      expect((await create(owner).expect(201)).body.data.status).toBe(StoryStatus.DRAFT)
      await create(owner, StoryStatus.PENDING_REVIEW).expect(201)
      await create(owner, StoryStatus.PUBLISHED).expect(403)
      await create(admin, StoryStatus.PUBLISHED).expect(201)
    })

    it('does not let an author publish or delete through PATCH', async () => {
      await http()
        .patch(`/api/v1/stories/${story.id}`)
        .set(as(owner))
        .send({ status: StoryStatus.PUBLISHED })
        .expect(403)
      await http()
        .patch(`/api/v1/stories/${story.id}`)
        .set(as(owner))
        .send({ status: StoryStatus.DELETED })
        .expect(400)
      expect((await dataSource.getRepository(Story).findOneByOrFail({ id: story.id })).status).toBe(
        StoryStatus.DRAFT
      )
    })
  })

  describe("another user's story versions", () => {
    const tamper = async (storyId: number, status: number) => {
      const base = `/api/v1/stories/${storyId}/versions`
      await http().post(base).set(as(other)).send({ commitMessage: 'x' }).expect(status)
      await http().post(`${base}/branch`).set(as(other)).send({ branchName: 'evil' }).expect(status)
      await http().post(`${base}/1/tag`).set(as(other)).send({ tag: 'evil' }).expect(status)
      await http()
        .post(`${base}/rollback`)
        .set(as(other))
        .send({ versionNumber: 1, commitMessage: 'evil' })
        .expect(status)
      expect(await dataSource.getRepository(StoryVersion).countBy({ storyId })).toBe(0)
    }

    it('cannot be created, branched, tagged or rolled back on a published story (403)', async () => {
      await dataSource.getRepository(Story).update(story.id, { status: StoryStatus.PUBLISHED })
      await tamper(story.id, 403)
    })

    it('answer 404 on a draft, which the other user cannot see at all', async () => {
      await tamper(story.id, 404)
    })
  })

  describe('users directory', () => {
    // Regular users have no Read User at all (they use /users/me); the per-record
    // check in the controller is defense in depth should a read-own rule be added
    it('is closed to regular users and open to admins', async () => {
      await http().get('/api/v1/users').set(as(owner)).expect(403)
      await http().get('/api/v1/users/stats').set(as(owner)).expect(403)
      await http().get(`/api/v1/users/${other.user.id}`).set(as(owner)).expect(403)
      await http().get('/api/v1/users').set(as(admin)).expect(200)
      await http().get(`/api/v1/users/${other.user.id}`).set(as(admin)).expect(200)
    })
  })

  describe('session cleanup administration', () => {
    it('is super-admin only', async () => {
      await http().get('/api/v1/admin/cleanup/stats').set(as(owner)).expect(403)
      await http().post('/api/v1/admin/cleanup/trigger').set(as(owner)).send({}).expect(403)
      await http().get('/api/v1/admin/cleanup/stats').set(as(admin)).expect(200)
    })
  })

  describe('public content API', () => {
    let draft: PostContent
    let published: PostContent

    beforeAll(async () => {
      const postType = await dataSource.getRepository(PostType).save({
        name: 'Audit Note',
        slug: 'audit-notes',
        singularLabel: 'Note',
        pluralLabel: 'Notes'
      })
      const save = (title: string, status: ContentStatus) =>
        dataSource.getRepository(PostContent).save({
          postTypeId: postType.id,
          title,
          slug: title.toLowerCase().replace(/\s+/g, '-'),
          fieldData: {},
          status,
          authorId: admin.user.id
        })
      draft = await save('Secret Draft', ContentStatus.DRAFT)
      published = await save('Public Note', ContentStatus.PUBLISHED)
    })

    it('shows anonymous visitors published entries only, whatever the filters say', async () => {
      const list = await http().get('/api/v1/content/audit-notes').expect(200)
      expect(list.body.data.data.map((c: { id: string }) => c.id)).toEqual([published.id])

      const asked = await http()
        .get('/api/v1/content/audit-notes?status=draft&includeDeleted=true')
        .expect(200)
      expect(asked.body.data.data.map((c: { id: string }) => c.id)).toEqual([published.id])

      await http().get(`/api/v1/content/audit-notes/${draft.id}`).expect(404)
      await http().get('/api/v1/content/audit-notes/slug/secret-draft').expect(404)
      await http().get(`/api/v1/content/audit-notes/${published.id}`).expect(200)
    })

    it('shows drafts to editors', async () => {
      await http().get(`/api/v1/content/audit-notes/${draft.id}`).set(as(moderator)).expect(200)
      const list = await http()
        .get('/api/v1/content/audit-notes?status=draft')
        .set(as(moderator))
        .expect(200)
      expect(list.body.data.data.map((c: { id: string }) => c.id)).toEqual([draft.id])
    })

    it('rejects a bad token instead of treating it as anonymous', async () => {
      await http()
        .get('/api/v1/content/audit-notes')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401)
    })
  })

  describe('attachments used by stories', () => {
    const file = (user: User, overrides: Partial<Attachment> = {}) =>
      dataSource.getRepository(Attachment).save({
        userId: user.id,
        path: `uploads/${user.id}/${Math.random()}.png`,
        originalName: 'image.png',
        mimeType: 'image/png',
        size: 100,
        isPublic: false,
        securityStatus: 'completed',
        ...overrides
      })

    it("cannot link another user's private file to your story", async () => {
      const theirs = await file(other.user)

      await http()
        .post(`/api/v1/stories/${story.id}/attachments`)
        .set(as(owner))
        .send({ attachmentIds: [theirs.id] })
        .expect(400)
    })

    it('cannot use an unverified direct upload as the main image', async () => {
      const pending = await file(owner.user, { securityStatus: 'pending_upload', isPublic: true })

      await http()
        .put(`/api/v1/stories/${story.id}/main-image`)
        .set(as(owner))
        .send({ attachmentId: pending.id })
        .expect(400)
    })
  })
})
