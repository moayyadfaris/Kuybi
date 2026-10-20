/**
 * Cached stories embed their tags, categories, main image and author. A write to any of
 * those through its own repository must drop the cached stories that embed it, single
 * story and lists alike.
 */
import { AttachmentsModule } from '@modules/attachments/attachments.module'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { AttachmentRepository } from '@modules/attachments/repositories/attachment.repository'
import { CategoriesModule } from '@modules/categories/categories.module'
import { Category } from '@modules/categories/entities/category.entity'
import { CategoryRepository } from '@modules/categories/repositories/category.repository'
import { Story, StoryStatus } from '@modules/stories/entities/story.entity'
import { StoriesModule } from '@modules/stories/stories.module'
import { Tag } from '@modules/tags/entities/tag.entity'
import { TagRepository } from '@modules/tags/repositories/tag.repository'
import { TagsModule } from '@modules/tags/tags.module'
import { UserRepository } from '@modules/users/repositories/user.repository'

import { StoryFactory } from '../../factories/story.factory'
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

describe('Story cache and embedded entities', () => {
  let t: HttpTestApp
  let owner: Actor
  let story: Story
  let tag: Tag
  let category: Category
  let image: Attachment

  const getStory = async () =>
    (await t.http().get(`/api/v1/stories/${story.id}`).set(owner.auth).expect(200)).body.data
  const getList = async () =>
    (
      await t
        .http()
        .get(`/api/v1/stories/status/${StoryStatus.PUBLISHED}`)
        .set(owner.auth)
        .expect(200)
    ).body.data[0]

  beforeAll(async () => {
    t = await createHttpTestApp([AttachmentsModule, TagsModule, CategoriesModule, StoriesModule], {
      resetTables: TABLES
    })
    owner = await t.signUp('owner@story-cache.test', 'user')
  })

  beforeEach(async () => {
    await t.dataSource.query(
      'DELETE FROM story_tags; DELETE FROM story_categories; DELETE FROM stories; ' +
        'DELETE FROM attachments; DELETE FROM tags; DELETE FROM categories'
    )
    await t.cache.reset()
    tag = await t.dataSource
      .getRepository(Tag)
      .save({ name: 'economy', createdBy: owner.user.id } as Tag)
    category = await t.dataSource
      .getRepository(Category)
      .save({ name: 'News', slug: 'news' } as Category)
    image = await t.dataSource.getRepository(Attachment).save({
      userId: owner.user.id,
      path: `uploads/${owner.user.id}/cover.png`,
      originalName: 'cover.png',
      mimeType: 'image/png',
      size: 1024,
      isPublic: true
    })
    story = await t.dataSource.getRepository(Story).save(
      StoryFactory.create({
        userId: owner.user.id,
        createdBy: owner.user.id,
        status: StoryStatus.PUBLISHED,
        tags: [tag],
        categories: [category],
        mainImageId: image.id
      }) as Story
    )
  })

  afterAll(async () => {
    await resetDatabase(t.dataSource, TABLES)
    await t.close()
  })

  it('shows a renamed tag', async () => {
    await getStory()
    await getList()
    await t.app.get(TagRepository).update(tag.id, { name: 'finance' })

    expect((await getStory()).tags[0].name).toBe('finance')
    expect((await getList()).tags[0].name).toBe('finance')
  })

  it('shows a renamed category', async () => {
    await getStory()
    await getList()
    await t.app.get(CategoryRepository).update(category.id, { name: 'World' })

    expect((await getStory()).categories[0].name).toBe('World')
    expect((await getList()).categories[0].name).toBe('World')
  })

  it('shows a changed main image', async () => {
    await getStory()
    await t.app.get(AttachmentRepository).update(image.id, { thumbnailPath: 'thumbs/cover.webp' })

    expect((await getStory()).mainImage.previewUrl).toMatch(/thumbs\/cover\.webp$/)
  })

  it("shows the author's new name", async () => {
    await getStory()
    await getList()
    await t.app.get(UserRepository).update(owner.user.id, { name: 'Renamed Author' })

    expect((await getStory()).user.name).toBe('Renamed Author')
    expect((await getList()).user.name).toBe('Renamed Author')
  })
})
