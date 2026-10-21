import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { versionConflict } from '@shared/errors'
import { PinoLogger } from 'nestjs-pino'

import { Action } from '@modules/acl'
import { User } from '@modules/users/entities'

import { Story, StoryStatus } from '../entities/story.entity'
import { StoryRepository } from '../repositories/story.repository'
import { assertStatusTransition } from '../story-status.rules'

import { StoriesService } from './stories.service'
import { StoryAccessPolicy } from './story-access.policy'
import { StoryEnrichmentService } from './story-enrichment.service'

/**
 * Soft delete, permanent delete, restore and status transitions. A story the user may
 * not read is reported as missing (404), as on reads.
 */
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

  /** Soft delete: status DELETED, with who, when and why */
  async remove(id: number, currentUser: User, reason?: string): Promise<void> {
    const story = await this.storiesService.findOne(id)
    this.accessPolicy.assertCanChange(
      currentUser,
      Action.Delete,
      story,
      'You do not have permission to delete this story'
    )

    await this.storyRepository.update(id, {
      deletedAt: new Date(),
      deletedBy: currentUser.id,
      deletionReason: reason ?? null,
      status: StoryStatus.DELETED
    })
    this.logger.info(
      { action: 'delete_story', storyId: id, userId: currentUser.id },
      'Story deleted'
    )
  }

  /** Removes the row and, by cascade, its versions and links (super-admin only) */
  async hardDelete(id: number, currentUser: User): Promise<void> {
    this.accessPolicy.assertCanManageAll(currentUser, 'Only admins can permanently delete stories')

    if (!(await this.storyRepository.delete(id))) {
      throw new NotFoundException(`Story with ID ${id} not found`)
    }
    this.logger.warn(
      { action: 'hard_delete_story', storyId: id, userId: currentUser.id },
      'Story permanently deleted'
    )
  }

  /** Brings a soft-deleted story back as a draft */
  async restore(id: number, currentUser: User): Promise<Story> {
    const story = await this.storyRepository.findById(id)
    if (!story) {
      throw new NotFoundException(`Story with ID ${id} not found`)
    }
    this.accessPolicy.assertCanChange(
      currentUser,
      Action.Restore,
      story,
      'You do not have permission to restore this story'
    )
    if (!story.deletedAt) {
      throw new BadRequestException('Story is not deleted')
    }

    const restored = await this.storyRepository.update(id, {
      deletedAt: null,
      deletedBy: null,
      deletionReason: null,
      status: StoryStatus.DRAFT,
      updatedBy: currentUser.id,
      lastModifiedBy: currentUser.id
    })
    this.logger.info(
      { action: 'restore_story', storyId: id, userId: currentUser.id },
      'Story restored'
    )
    return this.storyEnrichmentService.enrichStoryMedia(restored as Story)
  }

  /** Editorial status change: needs Publish on this story and a valid transition */
  async updateStatus(id: number, status: StoryStatus, currentUser: User): Promise<Story> {
    const story = await this.storiesService.findOne(id)
    this.accessPolicy.assertCanChange(
      currentUser,
      Action.Publish,
      story,
      'You do not have permission to change the status of this story'
    )
    assertStatusTransition(story.status, status)

    // Only from the status the transition was checked against (and moves the version
    // on): a concurrent change in between answers 409 instead of being overwritten
    const updated = await this.storyRepository.updateIfVersion(id, story.version, {
      status,
      updatedBy: currentUser.id,
      lastModifiedBy: currentUser.id
    })
    if (!updated) throw versionConflict('story')
    this.logger.info(
      {
        action: 'update_status',
        storyId: id,
        userId: currentUser.id,
        oldStatus: story.status,
        newStatus: status
      },
      'Story status updated'
    )
    return this.storyEnrichmentService.enrichStoryMedia(updated as Story)
  }
}
