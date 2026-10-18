/**
 * Public (unauthenticated) response shapes for the web API.
 *
 * These are allowlists: a field reaches the public API only if it is listed here.
 * Do not spread entities into responses - entities carry credentials (author password
 * hash), contact details, staff notes, precise locations and attachment encryption keys.
 */
import { Attachment } from '@modules/attachments/entities'
import { Category } from '@modules/categories/entities'
import { Story } from '@modules/stories/entities'
import { Tag } from '@modules/tags/entities'
import { User } from '@modules/users/entities'

export const toPublicAuthor = (user?: User | null) =>
  user ? { id: user.id, name: user.name } : null

export const toPublicTag = (tag: Tag) => ({ id: tag.id, name: tag.name, color: tag.color })

export const toPublicCategory = (category: Category) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description
})

/** Only public attachments are exposed; private ones are served via signed URLs only. */
export const toPublicImage = (image?: Attachment | null) =>
  image?.isPublic
    ? {
        id: image.id,
        path: image.path,
        thumbnailPath: image.thumbnailPath,
        mimeType: image.mimeType
      }
    : null

export const toPublicStory = (story: Story) => ({
  id: story.id,
  title: story.title,
  details: story.details,
  type: story.type,
  priority: story.priority,
  city: story.city,
  region: story.region,
  countryId: story.countryId,
  fromTime: story.fromTime,
  toTime: story.toTime,
  parentId: story.parentId,
  createdAt: story.createdAt,
  updatedAt: story.updatedAt,
  user: toPublicAuthor(story.user),
  mainImage: toPublicImage(story.mainImage),
  tags: (story.tags ?? []).map(toPublicTag),
  categories: (story.categories ?? []).map(toPublicCategory),
  metadata: story.metadata
    ? {
        viewCount: story.metadata.viewCount || 0,
        featuredImageUrl: story.metadata.featuredImageUrl
      }
    : undefined
})
