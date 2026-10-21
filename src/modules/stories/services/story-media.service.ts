import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { versionConflict } from '@shared/errors'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { Action } from '@modules/acl'
import {
  assertAttachmentUsable,
  AttachmentMetadata,
  AttachmentRepository,
  S3Service
} from '@modules/attachments'
import { User } from '@modules/users/entities'

import { Story } from '../entities/story.entity'
import { StoryRepository } from '../repositories/story.repository'

import { StoryAccessPolicy } from './story-access.policy'
import { StoryEnrichmentService } from './story-enrichment.service'

/**
 * A story's main image: one of the editor's own images, made public in storage when set
 * (the story shows it to everyone who can read the story)
 */
@Injectable()
export class StoryMediaService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly s3Service: S3Service,
    private readonly accessPolicy: StoryAccessPolicy,
    private readonly storyEnrichmentService: StoryEnrichmentService,
    @InjectPinoLogger(StoryMediaService.name)
    private readonly logger: PinoLogger
  ) {}

  async updateMainImage(storyId: number, attachmentId: string, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const story = await this.loadForUpdate(storyId, currentUser)

    const attachment = await this.attachmentRepository.findOne({ id: attachmentId })
    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }

    if (attachment.userId !== userId) {
      throw new BadRequestException('Attachment does not belong to this user')
    }
    assertAttachmentUsable(attachment)

    if (!attachment.mimeType.startsWith('image/')) {
      throw new BadRequestException('Attachment must be an image')
    }

    if (!attachment.isPublic) {
      await this.s3Service.makePublic(attachment.path)
      if (attachment.thumbnailPath) {
        await this.s3Service.makePublic(attachment.thumbnailPath)
      }

      // The original, its thumbnails and its placeholder all become public
      const metadata = (attachment.metadata || {}) as AttachmentMetadata
      const thumbnailKeys = Object.values(metadata.thumbnails ?? {})
        .map(thumb => thumb?.key)
        .filter((key): key is string => Boolean(key))
      await Promise.all(thumbnailKeys.map(key => this.s3Service.makePublic(key)))

      const placeholderKey = metadata.optimization?.placeholderKey
      if (placeholderKey) {
        await this.s3Service.makePublic(placeholderKey)
      }

      await this.attachmentRepository.update(attachmentId, { isPublic: true })
    }

    return this.setMainImage(story, attachmentId, userId)
  }

  async removeMainImage(storyId: number, currentUser: User): Promise<Story> {
    const story = await this.loadForUpdate(storyId, currentUser)
    return this.setMainImage(story, null, currentUser.id)
  }

  /** A live story the user may update (404 when missing, deleted or hidden from them) */
  private async loadForUpdate(storyId: number, user: User): Promise<Story> {
    const story = await this.storyRepository.findById(storyId)
    if (!story || story.deletedAt) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }
    this.accessPolicy.assertCanChange(
      user,
      Action.Update,
      story,
      'You do not have permission to modify this story'
    )
    return story
  }

  private async setMainImage(
    story: Story,
    attachmentId: string | null,
    userId: string
  ): Promise<Story> {
    const updated = await this.storyRepository.updateIfVersion(story.id, story.version, {
      mainImageId: attachmentId,
      lastModifiedBy: userId
    })
    // Changed (or deleted) since it was read
    if (!updated) throw versionConflict('story')
    this.logger.info(
      { action: 'set_main_image', storyId: story.id, attachmentId, userId },
      'Story main image changed'
    )
    return this.storyEnrichmentService.enrichStoryMedia(updated as Story)
  }
}
