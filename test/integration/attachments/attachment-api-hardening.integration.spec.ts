/**
 * Attachments API edge cases: what a response may contain (never the uploader's account
 * or the encryption key), metadata a client may not write (storage keys), soft-deleted
 * files, list scoping and paging, the stored objects of a permanent delete, the status of
 * a finished multipart upload, and malformed ids.
 */
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { S3Service } from '@modules/attachments/services/s3.service'
import { CategoriesModule } from '@modules/categories/categories.module'
import { Story } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { TagsModule } from '@modules/tags/tags.module'

import { StoryFactory } from '../../factories/story.factory'
import { FakeStorage } from '../../helpers/fake-storage'
import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'story_attachments',
  'story_tags',
  'story_categories',
  'story_versions',
  'stories',
  'attachments',
  'tags',
  'categories',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

describe('Attachments API hardening', () => {
  let t: HttpTestApp
  let storage: FakeStorage
  let owner: Actor
  let other: Actor
  let admin: Actor

  const rows = () => t.dataSource.getRepository(Attachment)
  const file = (by: Actor, overrides: Partial<Attachment> = {}) =>
    rows().save({
      userId: by.user.id,
      path: `uploads/${by.user.id}/${Math.random().toString(36).slice(2)}.png`,
      originalName: 'photo.png',
      mimeType: 'image/png',
      size: 1024,
      isPublic: true,
      securityStatus: 'completed',
      ...overrides
    } as Attachment)

  beforeAll(async () => {
    t = await createHttpTestApp([AttachmentsModule, TagsModule, CategoriesModule, StoriesModule], {
      resetTables: TABLES
    })
    storage = new FakeStorage()
    storage.install(t.app.get(S3Service))
    owner = await t.signUp('owner@attachment-hardening.test', 'user')
    other = await t.signUp('other@attachment-hardening.test', 'user')
    admin = await t.signUp('admin@attachment-hardening.test', 'super-admin')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM story_attachments; DELETE FROM stories; DELETE FROM attachments'
    )
    await t.cache.reset()
    storage.objects.clear()
    storage.publicKeys.clear()
    storage.aclChanges.length = 0
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  describe('responses', () => {
    it("never include the uploader's account or the encryption key", async () => {
      const shared = await file(owner, {
        encryptionKey: 'secret-key',
        scanResults: { engine: 'internal' }
      })
      const story = await t.dataSource.getRepository(Story).save(
        StoryFactory.create({
          userId: owner.user.id,
          status: 'PUBLISHED' as Story['status'],
          attachments: [shared]
        }) as Story
      )

      const responses = [
        await t.http().get(`/api/v1/attachments/${shared.id}`).set(other.auth).expect(200),
        await t.http().get('/api/v1/attachments').set(other.auth).expect(200),
        await t.http().get(`/api/v1/stories/${story.id}/attachments`).set(other.auth).expect(200)
      ]
      for (const response of responses) {
        const json = JSON.stringify(response.body)
        expect(json).toContain(shared.id)
        expect(json).not.toContain(owner.user.email)
        expect(json).not.toContain('secret-key')
        expect(json).not.toContain('scanResults')
      }
    })

    it('link to the versioned download route and give private files no storage URL', async () => {
      const secret = await file(owner, { isPublic: false, thumbnailPath: 'uploads/x/thumb.jpg' })

      const res = await t.http().get(`/api/v1/attachments/${secret.id}`).set(owner.auth).expect(200)
      expect(res.body.data.downloadUrl).toBe(`/api/v1/attachments/${secret.id}/download`)
      expect(res.body.data.url).toBeUndefined()
      expect(res.body.data.originalImageUrl).toBeUndefined()
      expect(res.body.data.previewUrl).toBeUndefined()
    })
  })

  it('answers 400 for a malformed id', async () => {
    await t.http().get('/api/v1/attachments/not-a-uuid').set(owner.auth).expect(400)
    await t.http().delete('/api/v1/attachments/not-a-uuid').set(owner.auth).expect(400)
  })

  it("does not let a client write storage keys into an attachment's metadata", async () => {
    const victim = await file(other, { isPublic: false })
    const mine = await file(owner)

    await t
      .http()
      .patch(`/api/v1/attachments/${mine.id}`)
      .set(owner.auth)
      .send({ metadata: { thumbnails: { x: { key: victim.path } } } })
      .expect(200)
    await t
      .http()
      .patch(`/api/v1/attachments/${mine.id}`)
      .set(owner.auth)
      .send({ isPublic: false })
      .expect(200)
    await t
      .http()
      .patch(`/api/v1/attachments/${mine.id}`)
      .set(owner.auth)
      .send({ isPublic: true })
      .expect(200)

    expect(storage.aclChanges.map(change => change.key)).not.toContain(victim.path)
  })

  describe('soft-deleted files', () => {
    it('are gone for reads, downloads and links', async () => {
      const deleted = await file(owner)
      await t.http().delete(`/api/v1/attachments/${deleted.id}`).set(owner.auth).expect(200)
      const story = await t.dataSource
        .getRepository(Story)
        .save(StoryFactory.create({ userId: owner.user.id }) as Story)

      await t.http().get(`/api/v1/attachments/${deleted.id}`).set(owner.auth).expect(404)
      await t.http().get(`/api/v1/attachments/${deleted.id}/download`).set(owner.auth).expect(404)
      await t
        .http()
        .post(`/api/v1/attachments/${deleted.id}/presigned-url`)
        .set(owner.auth)
        .send({})
        .expect(404)
      await t
        .http()
        .post(`/api/v1/stories/${story.id}/attachments`)
        .set(owner.auth)
        .send({ attachmentIds: [deleted.id] })
        .expect(400)
    })

    it("are not listed to users who cannot read everyone's files", async () => {
      const theirs = await file(other, { deletedAt: new Date() })

      const res = await t
        .http()
        .get('/api/v1/attachments')
        .query({ includeDeleted: true })
        .set(owner.auth)
        .expect(200)
      expect(res.body.data.data.map((a: Attachment) => a.id)).not.toContain(theirs.id)
    })
  })

  it("pages a user's file list", async () => {
    await Promise.all([file(owner), file(owner), file(owner)])

    const res = await t
      .http()
      .get(`/api/v1/attachments/user/${owner.user.id}`)
      .query({ limit: 2, page: 1 })
      .set(owner.auth)
      .expect(200)
    expect(res.body.data.data).toHaveLength(2)
    expect(res.body.data.total).toBe(3)
  })

  it('filters by the statuses attachments really have', async () => {
    await t
      .http()
      .get('/api/v1/attachments')
      .query({ securityStatus: 'completed' })
      .set(owner.auth)
      .expect(200)
  })

  it('removes every stored object of a permanently deleted file', async () => {
    const keys = ['uploads/a/photo.png', 'uploads/a/photo__small.jpg', 'uploads/a/photo__ph.jpg']
    for (const key of keys) storage.objects.set(key, PNG)
    const stored = await file(owner, {
      path: keys[0],
      thumbnailPath: keys[1],
      metadata: {
        thumbnails: { small: { key: keys[1] } },
        optimization: { placeholderKey: keys[2] }
      }
    })

    await t.http().delete(`/api/v1/attachments/${stored.id}/hard`).set(admin.auth).expect(200)
    expect([...storage.objects.keys()].filter(key => keys.includes(key))).toEqual([])
  })

  it('takes at most 10 files in one bulk upload', async () => {
    const bulk = (count: number) => {
      const request = t
        .http()
        .post('/api/v1/attachments/bulk')
        .set(owner.auth)
        .field('async', 'false')
      for (let i = 0; i < count; i++) {
        request.attach('files', PNG, { filename: `dot-${i}.png`, contentType: 'image/png' })
      }
      return request
    }

    await bulk(11).expect(400)
    const res = await bulk(10).expect(201)
    expect(res.body.data.attachments).toHaveLength(10)
  })

  it('marks a finished multipart upload as completed', async () => {
    const res = await t
      .http()
      .post('/api/v1/attachments')
      .set(owner.auth)
      .field('async', 'false')
      .attach('file', PNG, { filename: 'dot.png', contentType: 'image/png' })
      .expect(201)

    const stored = await rows().findOneByOrFail({ id: res.body.data.attachment.id })
    expect(stored.securityStatus).toBe('completed')
  })

  it('has no bulk "orphan" cleanup (it deleted profile and story images)', async () => {
    await t.http().post('/api/v1/attachments/cleanup-orphaned').set(admin.auth).expect(404)
  })
})
