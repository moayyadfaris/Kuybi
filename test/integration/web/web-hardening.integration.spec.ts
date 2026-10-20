/**
 * Public web API edge cases: images are given as URLs (never storage keys) and only when
 * public, live and cleared by the security scan; inactive categories and unsafe links stay
 * off the public site; malformed ids and oversized filters answer 400.
 */
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { CategoriesModule } from '@modules/categories/categories.module'
import { Category } from '@modules/categories/entities/category.entity'
import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { WebModule } from '@modules/web/web.module'

import { StoryFactory } from '../../factories/story.factory'
import { Actor, createHttpTestApp, HttpTestApp } from '../../helpers/http-test-app'
import { resetDatabase } from '../../helpers/reset-database'

const TABLES = [
  'story_categories',
  'story_versions',
  'stories',
  'categories',
  'attachments',
  'sessions',
  'user_roles',
  'role_permissions',
  'users',
  'roles',
  'permissions'
]

describe('Public web hardening', () => {
  let t: HttpTestApp
  let author: Actor

  const publish = (fields: Partial<Story> = {}) =>
    t.dataSource.getRepository(Story).save(
      StoryFactory.create({
        userId: author.user.id,
        createdBy: author.user.id,
        status: StoryStatus.PUBLISHED,
        ...fields
      }) as Story
    )
  const image = (fields: Partial<Attachment> = {}) =>
    t.dataSource.getRepository(Attachment).save({
      userId: author.user.id,
      path: 'uploads/images/photo.jpg',
      thumbnailPath: 'uploads/images/photo-thumb.jpg',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 1000,
      isPublic: true,
      securityStatus: 'completed',
      ...fields
    } as Attachment)
  const webStory = async (id: number) =>
    (await t.http().get(`/api/web/v1/stories/${id}`).expect(200)).body.data

  beforeAll(async () => {
    t = await createHttpTestApp([WebModule, StoriesModule, CategoriesModule], {
      resetTables: TABLES
    })
    author = await t.signUp('author@web-hardening.test', 'user')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM story_categories; DELETE FROM story_versions; DELETE FROM stories; DELETE FROM categories; DELETE FROM attachments'
    )
    await t.cache.reset()
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('gives the main image as URLs, never storage keys', async () => {
    const story = await publish({ mainImageId: (await image()).id })

    const { mainImage } = await webStory(story.id)
    expect(mainImage.url).toMatch(/^https?:\/\/.+photo\.jpg$/)
    expect(mainImage.previewUrl).toMatch(/^https?:\/\/.+photo-thumb\.jpg$/)
    expect(mainImage).not.toHaveProperty('path')
    expect(mainImage).not.toHaveProperty('thumbnailPath')
  })

  it('hides an image that is deleted or not cleared by the security scan', async () => {
    for (const fields of [
      { securityStatus: 'rejected' },
      { securityStatus: 'verifying' },
      { deletedAt: new Date() }
    ]) {
      const story = await publish({ mainImageId: (await image(fields)).id })
      expect((await webStory(story.id)).mainImage).toBeNull()
    }
  })

  it('keeps inactive categories off public stories', async () => {
    const [shown, hidden] = await t.dataSource.getRepository(Category).save([
      { name: 'Shown', slug: 'shown', isActive: true },
      { name: 'Hidden', slug: 'hidden', isActive: false }
    ] as Category[])
    const story = await publish()
    await t.dataSource.query(
      'INSERT INTO story_categories ("storyId", "categoryId") VALUES ($1, $2), ($1, $3)',
      [story.id, shown.id, hidden.id]
    )

    const { categories } = await webStory(story.id)
    expect(categories.map((c: Category) => c.slug)).toEqual(['shown'])
  })

  it('publishes only http(s) featured image links', async () => {
    const unsafe = await publish({ metadata: { featuredImageUrl: 'javascript:alert(1)' } })
    expect((await webStory(unsafe.id)).metadata.featuredImageUrl).toBeUndefined()

    const safe = await publish({ metadata: { featuredImageUrl: 'https://cdn.test/a.jpg' } })
    expect((await webStory(safe.id)).metadata.featuredImageUrl).toBe('https://cdn.test/a.jpg')
  })

  it('answers 400 for a malformed category id or oversized filters', async () => {
    await t.http().get('/api/web/v1/categories/not-a-uuid').expect(400)
    const long = 'x'.repeat(201)
    for (const query of [{ search: long }, { categorySlug: long }, { tag: long }]) {
      await t.http().get('/api/web/v1/stories').query(query).expect(400)
    }
  })
})
