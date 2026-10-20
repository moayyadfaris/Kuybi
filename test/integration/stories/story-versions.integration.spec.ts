/**
 * Story version lifecycle over HTTP: snapshot, auto-version on update, compare,
 * branch, merge, tag and rollback. Stories and versions are served from the cache as
 * plain JSON (dates as strings), the way production serves them.
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
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { AuthModule } from '@modules/auth/auth.module'
import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import {
  StoryVersion,
  VersionStatus,
  VersionType
} from '@modules/stories/entities/story-version.entity'
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
  'story_versions',
  'stories',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Story versions', () => {
  let app: INestApplication
  let dataSource: DataSource
  let token: string
  let userId: string
  let story: Story

  const http = () => request(app.getHttpServer())
  const auth = () => ({ Authorization: `Bearer ${token}` })
  const base = () => `/api/v1/stories/${story.id}/versions`
  const versions = () =>
    dataSource
      .getRepository(StoryVersion)
      .find({ where: { storyId: story.id }, order: { versionNumber: 'ASC' } })

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

    await resetDatabase(dataSource, TABLES)
    const roles = await seedRolesWithPermissions(dataSource)
    const password = 'Password123!'
    const data = await UserFactory.createWithHashedPassword({
      email: 'versions@test.com',
      password,
      primaryRoleId: roles['super-admin'].id
    })
    const user = await dataSource.getRepository(User).save(data as User)
    userId = user.id
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'versions@test.com', password })
      .expect(201)
    token = login.body.data.accessToken
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM story_versions')
    await dataSource.query('DELETE FROM stories')
    story = await dataSource.getRepository(Story).save(
      StoryFactory.create({
        userId,
        createdBy: userId,
        title: 'Original title',
        fromTime: new Date('2026-01-01T10:00:00Z')
      }) as Story
    )
  })

  afterAll(async () => {
    await resetDatabase(dataSource, TABLES)
    await app.close()
  })

  const snapshot = (body: object = {}) => http().post(base()).set(auth()).send(body).expect(201)
  const rename = (title: string) =>
    http().patch(`/api/v1/stories/${story.id}`).set(auth()).send({ title }).expect(200)

  it('snapshots a story with dates, twice in a row (second read is cached)', async () => {
    const first = await snapshot({ commitMessage: 'first' })
    expect(first.body.data.versionNumber).toBe(1)

    await rename('Second title')

    // Update auto-creates a version (best effort: a crash would be swallowed and logged)
    const afterUpdate = await versions()
    expect(afterUpdate.map(v => v.title)).toEqual(['Original title', 'Second title'])
    expect(afterUpdate[1].changeSummary).toContain('title')

    const list = await http().get(base()).set(auth()).expect(200)
    expect(list.body.data.length).toBe(2)
  })

  it('compares two versions field by field', async () => {
    await snapshot()
    await rename('Changed')
    const [v1, v2] = await versions()

    const res = await http()
      .post(`${base()}/compare`)
      .set(auth())
      .send({ versionA: v1.versionNumber, versionB: v2.versionNumber })
      .expect(200)

    expect(res.body.data.changedFields).toEqual(['title'])
    expect(res.body.data.diff.modified.title).toEqual({ old: 'Original title', new: 'Changed' })
  })

  it('branches, merges back into main, and keeps version and story status apart', async () => {
    await snapshot()
    const [v1] = await versions()

    await http()
      .post(`${base()}/branch`)
      .set(auth())
      .send({ branchName: 'feature', fromVersionNumber: v1.versionNumber })
      .expect(201)
    const branch = (await versions()).find(v => v.branchName === 'feature')!

    await http()
      .post(`${base()}/merge`)
      .set(auth())
      .send({
        fromBranch: 'feature',
        fromVersionNumber: branch.versionNumber,
        targetBranch: 'main',
        commitMessage: 'merge feature'
      })
      .expect(200)

    const merged = (await versions()).find(v => v.versionType === VersionType.MERGE)!
    expect(merged.branchName).toBe('main')
    expect(merged.status).toBe(VersionStatus.ACTIVE)
    expect(merged.storyStatus).toBe(story.status)
    expect(merged.title).toBe('Original title')
    expect(new Date(merged.fromTime!).toISOString()).toBe('2026-01-01T10:00:00.000Z')

    const info = await http().get(`${base()}/branches/info`).set(auth()).expect(200)
    expect(info.body.data.map((b: { name: string }) => b.name)).toEqual(['main', 'feature'])
  })

  it('tags a version once', async () => {
    await snapshot()
    const [v1] = await versions()

    await http()
      .post(`${base()}/${v1.versionNumber}/tag`)
      .set(auth())
      .send({ tag: 'v1.0' })
      .expect(200)

    expect((await versions())[0].tag).toBe('v1.0')
  })

  it('rolls the story back to an earlier version', async () => {
    await snapshot()
    await rename('Mistake')
    const [v1] = await versions()

    await http()
      .post(`${base()}/rollback`)
      .set(auth())
      .send({ versionNumber: v1.versionNumber, commitMessage: 'undo' })
      .expect(200)

    const restored = await dataSource.getRepository(Story).findOneByOrFail({ id: story.id })
    expect(restored.title).toBe('Original title')
    expect(restored.fromTime?.toISOString()).toBe('2026-01-01T10:00:00.000Z')
    expect((await versions()).some(v => v.isRollback)).toBe(true)
  })

  it('rolls back the content of a published story, not its status, in one version', async () => {
    await snapshot()
    await rename('Mistake')
    await http()
      .patch(`/api/v1/stories/${story.id}/status`)
      .set(auth())
      .send({ status: StoryStatus.PUBLISHED })
      .expect(200)
    const before = (await versions()).length

    await http()
      .post(`${base()}/rollback`)
      .set(auth())
      .send({ versionNumber: 1, commitMessage: 'undo' })
      .expect(200)

    const restored = await dataSource.getRepository(Story).findOneByOrFail({ id: story.id })
    expect(restored.title).toBe('Original title')
    expect(restored.status).toBe(StoryStatus.PUBLISHED)
    const added = (await versions()).slice(before)
    expect(added.map(v => v.versionType)).toEqual([VersionType.ROLLBACK])
  })

  it('leaves the story as it is when the rollback goes to a new branch', async () => {
    await snapshot()
    await rename('Current')

    await http()
      .post(`${base()}/rollback`)
      .set(auth())
      .send({ versionNumber: 1, commitMessage: 'try old', createBranch: true })
      .expect(200)

    const current = await dataSource.getRepository(Story).findOneByOrFail({ id: story.id })
    expect(current.title).toBe('Current')
    expect((await versions()).find(v => v.isRollback)?.branchName).toBe('rollback-to-v1')
  })

  it('answers 409 when a merge conflicts', async () => {
    await snapshot()
    await http()
      .post(`${base()}/branch`)
      .set(auth())
      .send({ branchName: 'feature', fromVersionNumber: 1 })
      .expect(201)
    await rename('Feature title')
    await snapshot({ branchName: 'feature' })
    await rename('Main title')
    const source = (await versions()).filter(v => v.branchName === 'feature').pop()!

    await http()
      .post(`${base()}/merge`)
      .set(auth())
      .send({
        fromBranch: 'feature',
        fromVersionNumber: source.versionNumber,
        targetBranch: 'main',
        commitMessage: 'merge feature'
      })
      .expect(409)
  })
})
