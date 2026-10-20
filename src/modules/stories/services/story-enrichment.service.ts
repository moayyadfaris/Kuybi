import { Injectable } from '@nestjs/common'

import { AttachmentPresenter } from '@modules/attachments'
import { Attachment } from '@modules/attachments/entities'

import { Story } from '../entities/story.entity'

/**
 * Puts a story's main image and attachments in their API shape (AttachmentPresenter):
 * storage URLs for public files, never the encryption key or the uploader's account
 */
@Injectable()
export class StoryEnrichmentService {
  constructor(private readonly attachmentPresenter: AttachmentPresenter) {}

  enrichStoryMedia<T extends Story | null | undefined>(story: T): T {
    if (!story) return story
    if (story.mainImage) {
      story.mainImage = this.present(story.mainImage)
    }
    if (story.attachments?.length) {
      story.attachments = story.attachments.map(attachment => this.present(attachment))
    }
    return story
  }

  enrichStoriesCollection(stories: Story[]): Story[] {
    return stories.map(story => this.enrichStoryMedia(story))
  }

  /** The response shape stands in for the entity on the story */
  present(attachment: Attachment): Attachment {
    return this.attachmentPresenter.present(attachment) as unknown as Attachment
  }
}
