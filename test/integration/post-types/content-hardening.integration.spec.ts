/**
 * Dynamic content edge cases: what a public reader may see (no author email, nothing of an
 * inactive post type), field_data updates (partial, after a field was removed), the
 * Publish permission on every way of publishing, scheduled publishing, names and slugs
 * reused after a soft delete, list totals, and deleting a post type that has content.
 */
import { Job, Queue } from 'bullmq'
import { PinoLogger } from 'nestjs-pino'

import { Action, Subject } from '@modules/acl'
import { Permission } from '@modules/acl/entities/permission.entity'
import { RolePermission } from '@modules/acl/entities/role-permission.entity'
import { FieldDefinition } from '@modules/post-types/entities/field-definition.entity'
import { PostContent } from '@modules/post-types/entities/post-content.entity'
import { PostType } from '@modules/post-types/entities/post-type.entity'
import { ContentStatus } from '@modules/post-types/enums/content-status.enum'
import { FieldType } from '@modules/post-types/enums/field-type.enum'
import { ContentPublishingProcessor } from '@modules/post-types/jobs/content-publishing.processor'
import { PostTypesModule } from '@modules/post-types/post-types.module'
import { ContentService } from '@modules/post-types/services/content.service'

import { ContentJobType } from '@core/queues/jobs/types'

import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'post_content_attachments',
  'post_content_tags',
  'post_content_categories',
  'post_content',
  'field_definitions',
  'post_types',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Dynamic content hardening', () => {
  let t: HttpTestApp
  let admin: Actor
  let editor: Actor
  let postType: PostType

  const base = () => `/api/v1/content/${postType.slug}`
  const contents = () => t.dataSource.getRepository(PostContent)
  const field = (name: string, overrides: Partial<FieldDefinition> = {}) =>
    t.dataSource.getRepository(FieldDefinition).save({
      postTypeId: postType.id,
      name,
      label: name,
      fieldType: FieldType.TEXT,
      ...overrides
    } as FieldDefinition)
  const create = (body: object, as: Actor = admin) =>
    t
      .http()
      .post(base())
      .set(as.auth)
      .send({ field_data: {}, ...body })

  beforeAll(async () => {
    t = await createHttpTestApp([PostTypesModule], { resetTables: TABLES })
    admin = await t.signUp('admin@content-hardening.test', 'super-admin')
    editor = await t.signUp('editor@content-hardening.test', 'moderator')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM post_content; DELETE FROM field_definitions; DELETE FROM post_types'
    )
    await t.cache.reset()
    postType = await t.dataSource.getRepository(PostType).save({
      name: 'Event',
      slug: 'event',
      singularLabel: 'Event',
      pluralLabel: 'Events',
      isActive: true
    } as PostType)
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it("does not show public readers the author's email", async () => {
    const res = await create({ title: 'Launch', status: ContentStatus.PUBLISHED }).expect(201)

    const byId = await t.http().get(`${base()}/${res.body.data.id}`).expect(200)
    const bySlug = await t.http().get(`${base()}/slug/${res.body.data.slug}`).expect(200)
    for (const body of [byId.body, bySlug.body]) {
      expect(JSON.stringify(body)).not.toContain(admin.user.email)
    }
  })

  it('hides the content of an inactive post type from public readers', async () => {
    await create({ title: 'Launch', status: ContentStatus.PUBLISHED }).expect(201)
    await t.dataSource.getRepository(PostType).update(postType.id, { isActive: false })
    await t.cache.reset()

    await t.http().get(base()).expect(404)
    await t.http().get(base()).set(admin.auth).expect(200)
  })

  describe('field_data', () => {
    it('keeps the fields an update does not send', async () => {
      await Promise.all([field('venue'), field('city')])
      const res = await create({
        title: 'Launch',
        field_data: { venue: 'Hall A', city: 'Amman' }
      }).expect(201)

      await t
        .http()
        .patch(`${base()}/${res.body.data.id}`)
        .set(admin.auth)
        .send({ field_data: { venue: 'Hall B' } })
        .expect(200)

      const stored = await contents().findOneByOrFail({ id: res.body.data.id })
      expect(stored.fieldData).toEqual({ venue: 'Hall B', city: 'Amman' })
    })

    it('can still be updated after one of its fields was removed', async () => {
      const [venue] = await Promise.all([field('venue'), field('city')])
      const res = await create({
        title: 'Launch',
        field_data: { venue: 'Hall A', city: 'Amman' }
      }).expect(201)
      await t
        .http()
        .delete(`/api/v1/post-types/${postType.id}/fields/${venue.id}`)
        .set(admin.auth)
        .expect(204)

      await t
        .http()
        .patch(`${base()}/${res.body.data.id}`)
        .set(admin.auth)
        .send({ field_data: { city: 'Irbid' } })
        .expect(200)
    })
  })

  describe('publishing', () => {
    it('needs Publish to create or update content as published', async () => {
      // A role that may write content but not publish it
      const publish = await t.dataSource
        .getRepository(Permission)
        .findOneByOrFail({ action: Action.Publish, subject: Subject.Content })
      await t.dataSource
        .getRepository(RolePermission)
        .delete({ roleId: t.roles['moderator'].id, permissionId: publish.id })
      await t.cache.reset()

      try {
        await create({ title: 'Sneaky', status: ContentStatus.PUBLISHED }, editor).expect(403)
        const draft = await create({ title: 'Draft' }, editor).expect(201)
        await t
          .http()
          .patch(`${base()}/${draft.body.data.id}`)
          .set(editor.auth)
          .send({ status: ContentStatus.PUBLISHED })
          .expect(403)
        await t
          .http()
          .post(`${base()}/${draft.body.data.id}/schedule`)
          .set(editor.auth)
          .send({ scheduledFor: new Date(Date.now() + 3_600_000).toISOString() })
          .expect(403)
      } finally {
        await t.dataSource
          .getRepository(RolePermission)
          .save({ roleId: t.roles['moderator'].id, permissionId: publish.id } as RolePermission)
        await t.cache.reset()
      }
    })

    it('refuses the deleted status outside DELETE', async () => {
      await create({ title: 'Ghost', status: ContentStatus.DELETED }).expect(400)
    })

    it('stamps publishedAt when content is published through an update', async () => {
      const draft = await create({ title: 'Draft' }).expect(201)
      await t
        .http()
        .patch(`${base()}/${draft.body.data.id}`)
        .set(admin.auth)
        .send({ status: ContentStatus.PUBLISHED })
        .expect(200)

      expect(
        (await contents().findOneByOrFail({ id: draft.body.data.id })).publishedAt
      ).toBeTruthy()
    })

    it('publishes scheduled content once its time has come', async () => {
      const draft = await create({ title: 'Later' }).expect(201)
      await t
        .http()
        .post(`${base()}/${draft.body.data.id}/schedule`)
        .set(admin.auth)
        .send({ scheduledFor: new Date(Date.now() + 60_000).toISOString() })
        .expect(200)
      await contents().update(draft.body.data.id, { scheduledAt: new Date(Date.now() - 1000) })

      const processor = new ContentPublishingProcessor(
        t.app.get(ContentService),
        { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
        {} as Queue
      )
      expect(
        await processor.process({ id: '1', name: ContentJobType.PUBLISH_DUE, data: {} } as Job)
      ).toEqual({ published: 1 })

      const stored = await contents().findOneByOrFail({ id: draft.body.data.id })
      expect(stored.status).toBe(ContentStatus.PUBLISHED)
      expect(stored.publishedAt).toBeTruthy()
      await t.http().get(`${base()}/${draft.body.data.id}`).expect(200)
    })
  })

  describe('unique fields', () => {
    const sku = (value: string, as: Actor = admin) =>
      create({ title: `Item ${value} ${Math.random()}`, field_data: { sku: value } }, as)

    it('refuse a value another live entry has, on create and on update', async () => {
      await field('sku', { isUnique: true })
      const first = await sku('X1').expect(201)
      await sku('X1').expect(409)

      const second = await sku('X2').expect(201)
      await t
        .http()
        .patch(`${base()}/${second.body.data.id}`)
        .set(admin.auth)
        .send({ field_data: { sku: 'X1' } })
        .expect(409)
      // Saving an entry with its own value is not a conflict
      await t
        .http()
        .patch(`${base()}/${first.body.data.id}`)
        .set(admin.auth)
        .send({ field_data: { sku: 'X1' }, title: 'Renamed' })
        .expect(200)

      // A deleted entry's value is free again
      await t.http().delete(`${base()}/${first.body.data.id}`).set(admin.auth).expect(204)
      await sku('X1').expect(201)
    })

    it('let only one of several concurrent writers take a value', async () => {
      await field('sku', { isUnique: true })

      const statuses = (await Promise.all(Array.from({ length: 5 }, () => sku('RACE')))).map(
        res => res.status
      )
      expect(statuses.filter(status => status === 201)).toHaveLength(1)
      expect(statuses.filter(status => status === 409)).toHaveLength(4)
    })

    it('cannot be switched on while entries share a value', async () => {
      const code = await field('code')
      await create({ title: 'A', field_data: { code: 'same' } }).expect(201)
      await create({ title: 'B', field_data: { code: 'same' } }).expect(201)

      await t
        .http()
        .patch(`/api/v1/post-types/${postType.id}/fields/${code.id}`)
        .set(admin.auth)
        .send({ isUnique: true })
        .expect(409)
    })
  })

  describe('reuse after a soft delete', () => {
    it('frees a content slug', async () => {
      const first = await create({ title: 'Hello' }).expect(201)
      await t.http().delete(`${base()}/${first.body.data.id}`).set(admin.auth).expect(204)

      const again = await create({ title: 'Hello' }).expect(201)
      expect(again.body.data.slug).toBe('hello')
    })

    it('frees a field name', async () => {
      const venue = await field('venue')
      await t
        .http()
        .delete(`/api/v1/post-types/${postType.id}/fields/${venue.id}`)
        .set(admin.auth)
        .expect(204)

      await t
        .http()
        .post(`/api/v1/post-types/${postType.id}/fields`)
        .set(admin.auth)
        .send({ name: 'venue', label: 'Venue', fieldType: FieldType.TEXT })
        .expect(201)
    })

    it('frees a post type name', async () => {
      const res = await t
        .http()
        .post('/api/v1/post-types')
        .set(admin.auth)
        .send({ name: 'Recipe', singularLabel: 'Recipe', pluralLabel: 'Recipes' })
        .expect(201)
      await t.http().delete(`/api/v1/post-types/${res.body.data.id}`).set(admin.auth).expect(204)

      await t
        .http()
        .post('/api/v1/post-types')
        .set(admin.auth)
        .send({ name: 'Recipe', singularLabel: 'Recipe', pluralLabel: 'Recipes' })
        .expect(201)
    })
  })

  it('counts every matching entry, not just the page', async () => {
    for (const title of ['One', 'Two', 'Three']) {
      await create({ title, status: ContentStatus.PUBLISHED }).expect(201)
    }

    const res = await t.http().get(base()).query({ limit: 2 }).expect(200)
    expect(res.body.data.data).toHaveLength(2)
    expect(res.body.data.total).toBe(3)
  })

  it('answers 400 for an unknown status filter', async () => {
    await t.http().get(base()).query({ status: 'nope' }).set(admin.auth).expect(400)
  })

  it('does not delete a post type that still has content', async () => {
    await create({ title: 'Launch' }).expect(201)

    await t.http().delete(`/api/v1/post-types/${postType.id}`).set(admin.auth).expect(409)
  })

  it('lists inactive post types to editors only', async () => {
    await t.dataSource.getRepository(PostType).save({
      name: 'Hidden',
      slug: 'hidden',
      singularLabel: 'Hidden',
      pluralLabel: 'Hidden',
      isActive: false
    } as PostType)

    const slugs = async (as?: Actor) => {
      const request = t.http().get('/api/v1/post-types').query({ includeInactive: true })
      const res = await (as ? request.set(as.auth) : request).expect(200)
      return res.body.data.map((type: PostType) => type.slug)
    }
    expect(await slugs()).not.toContain('hidden')
    expect(await slugs(admin)).toContain('hidden')
  })
})
