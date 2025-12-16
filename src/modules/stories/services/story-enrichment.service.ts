import { Injectable } from '@nestjs/common'

import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { toAttachmentResponse } from '@modules/attachments/utils/attachment-url.util'
import { Story } from '@modules/stories/entities/story.entity'

@Injectable()
export class StoryEnrichmentService {
  enrichStoryAttachment(attachment?: Attachment | null): Attachment | undefined {
    if (!attachment) {
      return undefined
    }

    const enriched = toAttachmentResponse(attachment)
    return enriched as unknown as Attachment
  }

  enrichStoryMedia<T extends Story | null | undefined>(story: T): T {
    if (!story) {
      return story
    }

    if (story.mainImage) {
      story.mainImage = this.enrichStoryAttachment(story.mainImage)
    }

    if (Array.isArray(story.attachments) && story.attachments.length > 0) {
      story.attachments = story.attachments
        .map(attachment => this.enrichStoryAttachment(attachment))
        .filter((attachment): attachment is Attachment => Boolean(attachment))
    }

    return story
  }

  enrichStoriesCollection(stories: Story[]): Story[] {
    return stories.map(story => this.enrichStoryMedia(story) as Story)
  }
}
