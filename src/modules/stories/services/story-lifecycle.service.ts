import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { errorMessage } from '@shared/utils/error.util'
import { PinoLogger } from 'nestjs-pino'

import { Action } from '@modules/acl'
import { User } from '@modules/users/entities'

import { Story, StoryStatus } from '../entities/story.entity'
import { StoryRepository } from '../repositories/story.repository'
import { assertStatusTransition } from '../story-status.rules'

import { StoriesService } from './stories.service'
import { StoryAccessPolicy } from './story-access.policy'
import { StoryEnrichmentService } from './story-enrichment.service'

/** Soft delete, permanent delete, restore and status transitions */
@Injectable()
export class StoryLifecycleService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly storiesService: StoriesService,
    private readonly storyEnrichmentService: StoryEnrichmentService,
    private readonly accessPolicy: StoryAccessPolicy,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(StoryLifecycleService.name)
  }

  /**
   * Soft delete story
   */
  async remove(id: number, currentUser: User, reason?: string): Promise<void> {
    const userId = currentUser.id
    this.logger.info({ action: 'delete_story', storyId: id, userId, reason }, 'Deleting story')

    try {
      const story = await this.storiesService.findOne(id)

      if (!this.accessPolicy.can(currentUser, Action.Delete, story)) {
        this.logger.warn(
          {
            action: 'delete_story',
            storyId: id,
            ownerId: story.userId,
            requesterId: userId
          },
          'Delete denied due to insufficient permissions'
        )
        throw new ForbiddenException('You do not have permission to delete this story')
      }

      // Soft delete with metadata
      await this.storyRepository.update(id, {
        deletedAt: new Date(),
        deletedBy: userId,
        deletionReason: reason,
        status: StoryStatus.DELETED
      })

      this.logger.info(
        { action: 'delete_story', storyId: id, userId },
        'Story deleted successfully'
      )
    } catch (error) {
      this.logger.error(
        { action: 'delete_story', storyId: id, userId, error: errorMessage(error) },
        'Failed to delete story'
      )
      throw error
    }
  }

  /**
   * Permanently delete story (admin only)
   */
  async hardDelete(id: number, currentUser: User): Promise<void> {
    const userId = currentUser.id
    this.logger.warn(
      { action: 'hard_delete_story', storyId: id, userId },
      'Permanently deleting story'
    )

    try {
      this.accessPolicy.assertCanManageAll(
        currentUser,
        'Only admins can permanently delete stories'
      )

      const deleted = await this.storyRepository.delete(id)

      if (!deleted) {
        throw new NotFoundException(`Story with ID ${id} not found`)
      }

      this.logger.info(
        { action: 'hard_delete_story', storyId: id, userId },
        'Story permanently deleted'
      )
    } catch (error) {
      this.logger.error(
        { action: 'hard_delete_story', storyId: id, userId, error: errorMessage(error) },
        'Failed to permanently delete story'
      )
      throw error
    }
  }

  /**
   * Restore soft-deleted story
   */
  async restore(id: number, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    this.logger.info({ action: 'restore_story', storyId: id, userId }, 'Restoring story')

    try {
      const story = await this.storyRepository.findById(id)

      if (!story) {
        throw new NotFoundException(`Story with ID ${id} not found`)
      }

      if (!story.deletedAt) {
        throw new BadRequestException('Story is not deleted')
      }

      this.accessPolicy.assertCan(
        currentUser,
        Action.Restore,
        story,
        'You do not have permission to restore this story'
      )

      const restored = await this.storyRepository.update(id, {
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
        status: StoryStatus.DRAFT,
        updatedBy: userId,
        lastModifiedBy: userId
      })

      this.logger.info(
        { action: 'restore_story', storyId: id, userId },
        'Story restored successfully'
      )

      return this.storyEnrichmentService.enrichStoryMedia(restored) as Story
    } catch (error) {
      this.logger.error(
        { action: 'restore_story', storyId: id, userId, error: errorMessage(error) },
        'Failed to restore story'
      )
      throw error
    }
  }

  /**
   * Update story status
   */
  async updateStatus(id: number, status: StoryStatus, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    this.logger.info(
      { action: 'update_status', storyId: id, userId, status },
      'Updating story status'
    )

    try {
      const story = await this.storiesService.findOne(id)

      // The route requires Publish on stories in general; check it for this story too
      this.accessPolicy.assertCan(
        currentUser,
        Action.Publish,
        story,
        'You do not have permission to change the status of this story'
      )

      assertStatusTransition(story.status, status)

      const updated = await this.storyRepository.update(id, {
        status,
        updatedBy: userId,
        lastModifiedBy: userId
      })

      this.logger.info(
        {
          action: 'update_status',
          storyId: id,
          userId,
          oldStatus: story.status,
          newStatus: status
        },
        'Story status updated'
      )

      return this.storyEnrichmentService.enrichStoryMedia(updated) as Story
    } catch (error) {
      this.logger.error(
        { action: 'update_status', storyId: id, userId, status, error: errorMessage(error) },
        'Failed to update story status'
      )
      throw error
    }
  }
}
