import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

import { Action } from '@modules/acl'
import { AttachmentMetadata, AttachmentRepository, S3Service } from '@modules/attachments'
import { User } from '@modules/users/entities'

import { LoggingContextService } from '@core/logging/logging-context.service'

import { Story } from '../entities/story.entity'
import { StoryRepository } from '../repositories/story.repository'

import { StoryAccessPolicy } from './story-access.policy'

/** A story's main image: validating the attachment and making it public */
@Injectable()
export class StoryMediaService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly s3Service: S3Service,
    private readonly accessPolicy: StoryAccessPolicy,
    private readonly loggingContext: LoggingContextService
  ) {}

  /**
   * Update story main image
   */
  async updateMainImage(storyId: number, attachmentId: string, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const requestLogger = this.loggingContext.getLogger({
      context: StoryMediaService.name,
      action: 'update_main_image'
    })

    requestLogger.info({ storyId, attachmentId, userId }, 'Updating story main image')

    // Find the story
    const story = await this.storyRepository.findById(storyId)
    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }
    this.accessPolicy.assertCan(
      currentUser,
      Action.Update,
      story,
      'You do not have permission to modify this story'
    )

    // Verify the attachment exists
    const attachment = await this.attachmentRepository.findOne({ id: attachmentId })

    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }

    // Verify attachment belongs to the user
    if (attachment.userId !== userId) {
      throw new BadRequestException('Attachment does not belong to this user')
    }

    // Verify it's an image
    if (!attachment.mimeType.startsWith('image/')) {
      throw new BadRequestException('Attachment must be an image')
    }

    // Make the attachment public in S3 if it's not already
    if (!attachment.isPublic) {
      await this.s3Service.makePublic(attachment.path)
      if (attachment.thumbnailPath) {
        await this.s3Service.makePublic(attachment.thumbnailPath)
      }

      const metadata = (attachment.metadata || {}) as AttachmentMetadata
      const thumbnails = metadata.thumbnails
      if (thumbnails) {
        const keys = Object.values(thumbnails)
          .map(thumb => thumb?.key)
          .filter((key): key is string => Boolean(key))

        await Promise.all(keys.map(key => this.s3Service.makePublic(key)))
      }

      const optimization = metadata.optimization
      const placeholderKey = optimization?.placeholderKey
      if (placeholderKey) {
        await this.s3Service.makePublic(placeholderKey)
      }

      if (optimization || placeholderKey !== undefined) {
        metadata.optimization = {
          ...(optimization || {}),
          placeholderKey
        }
      }

      // Update attachment record to reflect it's now public
      await this.attachmentRepository.update(attachmentId, { isPublic: true, metadata })

      requestLogger.info({ attachmentId }, 'Attachment made public for main image')
    }

    // Update story with the main image using repository to handle cache invalidation
    await this.storyRepository.update(storyId, {
      mainImageId: attachmentId,
      lastModifiedBy: userId,
      version: story.version + 1
    })

    requestLogger.info({ storyId, attachmentId }, 'Story main image updated successfully')

    // Return the updated story with relations
    return (await this.storyRepository.findById(storyId))!
  }

  /**
   * Remove story main image
   */
  async removeMainImage(storyId: number, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const requestLogger = this.loggingContext.getLogger({
      context: StoryMediaService.name,
      action: 'remove_main_image'
    })

    requestLogger.info({ storyId, userId }, 'Removing story main image')

    // Find the story
    const story = await this.storyRepository.findById(storyId)
    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }
    this.accessPolicy.assertCan(
      currentUser,
      Action.Update,
      story,
      'You do not have permission to modify this story'
    )

    // Remove main image using repository to handle cache invalidation
    await this.storyRepository.update(storyId, {
      mainImageId: null,
      lastModifiedBy: userId,
      version: story.version + 1
    })

    requestLogger.info({ storyId }, 'Story main image removed successfully')

    // Return the updated story with relations
    return (await this.storyRepository.findById(storyId))!
  }
}
