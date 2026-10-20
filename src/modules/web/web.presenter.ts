/**
 * Public (unauthenticated) response shapes for the web API.
 *
 * These are allowlists: a field reaches the public API only if it is listed here.
 * Do not spread entities into responses - entities carry credentials (author password
 * hash), contact details, staff notes, precise locations and attachment encryption keys.
 */
import { Injectable } from '@nestjs/common'

import { AttachmentPresenter } from '@modules/attachments'
import { Attachment } from '@modules/attachments/entities'
import { Category } from '@modules/categories/entities'
import { Story } from '@modules/stories/entities'
import { Tag } from '@modules/tags/entities'
import { User } from '@modules/users/entities'

/** Scan states of a file that is safe to show ('pending' is the legacy completed) */
const CLEARED = ['completed', 'pending']

/** Links authors may set; anything else (javascript:, data:...) is dropped */
const isWebUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value)

export const toPublicCategory = (category: Category) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description
})

@Injectable()
export class WebPresenter {
  constructor(private readonly attachmentPresenter: AttachmentPresenter) {}

  story(story: Story) {
    return {
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
      user: this.author(story.user),
      mainImage: this.image(story.mainImage),
      tags: (story.tags ?? []).map(this.tag),
      // Deleted categories are not loaded; inactive ones stay off the public site
      categories: (story.categories ?? []).filter(c => c.isActive).map(toPublicCategory),
      metadata: story.metadata
        ? {
            viewCount: story.metadata.viewCount || 0,
            featuredImageUrl: isWebUrl(story.metadata.featuredImageUrl)
              ? story.metadata.featuredImageUrl
              : undefined
          }
        : undefined
    }
  }

  private author(user?: User | null) {
    return user ? { id: user.id, name: user.name } : null
  }

  private tag(tag: Tag) {
    return { id: tag.id, name: tag.name, color: tag.color }
  }

  /** URLs of a public, live image the security scan cleared; null otherwise */
  private image(image?: Attachment | null) {
    if (!image?.isPublic || image.deletedAt || !CLEARED.includes(image.securityStatus)) {
      return null
    }
    const presented = this.attachmentPresenter.present(image)
    return {
      id: presented.id,
      mimeType: presented.mimeType,
      width: presented.metadata?.width,
      height: presented.metadata?.height,
      url: presented.url,
      previewUrl: presented.previewUrl,
      placeholderUrl: presented.placeholderUrl,
      thumbnails: presented.thumbnails
    }
  }
}
