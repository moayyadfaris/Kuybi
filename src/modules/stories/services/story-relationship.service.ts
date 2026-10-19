import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { errorMessage } from '@shared/utils/error.util'
import { PinoLogger } from 'nestjs-pino'
import { In } from 'typeorm'

import { Action } from '@modules/acl'
import {
  assertAttachmentUsable,
  AttachmentRepository,
  toAttachmentResponse
} from '@modules/attachments'
import { Attachment } from '@modules/attachments/entities'
import { CategoryRepository } from '@modules/categories'
import { Category } from '@modules/categories/entities'
import { TagRepository } from '@modules/tags'
import { Tag } from '@modules/tags/entities'
import { User } from '@modules/users/entities'

import {
  AttachAttachmentsDto,
  AttachCategoriesDto,
  AttachTagsDto,
  DetachAttachmentsDto,
  DetachCategoriesDto,
  DetachTagsDto
} from '../dto'
import { Story } from '../entities/story.entity'
import { StoryRepository } from '../repositories/story.repository'

import { StoryAccessPolicy } from './story-access.policy'

type Relation = 'attachments' | 'tags' | 'categories'
type Linked = { id: string | number }

@Injectable()
export class StoryRelationshipService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly tagRepository: TagRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly logger: PinoLogger,
    private readonly accessPolicy: StoryAccessPolicy
  ) {
    this.logger.setContext(StoryRelationshipService.name)
  }

  /**
   * Helper method to resolve tags by IDs and names, creating new tags if needed
   */
  async resolveAndCreateTags(
    tagIds?: number[],
    tagNames?: string[],
    userId?: string
  ): Promise<Tag[]> {
    this.logger.debug({ tagIds, tagNames, userId }, 'Resolving and creating tags')

    const resolvedTags: Map<number, Tag> = new Map()

    // 1. Resolve tags by IDs (Batch fetch)
    if (tagIds && tagIds.length > 0) {
      this.logger.debug({ tagIds, count: tagIds.length }, 'Resolving tags by IDs')
      const tagsById = await this.tagRepository.findMany({
        where: { id: In(tagIds) }
      })

      if (tagsById.length !== tagIds.length) {
        const foundIds = tagsById.map(t => t.id)
        const missingIds = tagIds.filter(id => !foundIds.includes(id))
        this.logger.warn({ missingIds }, 'Some tag IDs not found')
        throw new BadRequestException(`Tags not found: ${missingIds.join(', ')}`)
      }

      tagsById.forEach(tag => resolvedTags.set(tag.id, tag))
    }

    // 2. Resolve/create tags by names (Batch fetch + specific create)
    if (tagNames && tagNames.length > 0) {
      const normalizedNames = [...new Set(tagNames.map(n => n.trim().toLowerCase()))]

      // Fetch existing tags by name in one go
      const existingTags = await this.tagRepository.findMany({
        where: { name: In(normalizedNames) }
      })

      existingTags.forEach(tag => resolvedTags.set(tag.id, tag))

      // Identify missing tags
      const existingNames = existingTags.map(t => t.name)
      const missingNames = normalizedNames.filter(n => !existingNames.includes(n))

      if (missingNames.length > 0) {
        if (!userId) {
          this.logger.warn({ missingNames }, 'Cannot create tags without userId')
          // If we can't create, we just skip them (or throw, depending on reqs. Existing logic skipped nulls)
        } else {
          // Create missing tags individually (names must be unique, potential race condtion if parallel)
          // Since it's user input, sequential creation is safer or Promise.allSettled
          // For now, simple loop is better than N+1 reads AND writes. This is N writes only.
          this.logger.info({ count: missingNames.length }, 'Creating new tags')

          await Promise.all(
            missingNames.map(async name => {
              try {
                const newTag = await this.tagRepository.create({
                  name,
                  createdBy: userId,
                  updatedBy: userId
                })
                resolvedTags.set(newTag.id, newTag)
              } catch (error) {
                // Handle race condition where tag might be created by another req
                this.logger.warn(
                  { name, error: errorMessage(error) },
                  'Failed to create tag, trying to fetch'
                )
                const existing = await this.tagRepository.findByName(name)
                if (existing) resolvedTags.set(existing.id, existing)
              }
            })
          )
        }
      }
    }

    const result = Array.from(resolvedTags.values())
    this.logger.debug({ totalTags: result.length }, 'Tags resolution complete')
    return result
  }

  /**
   * Attach attachments to story: your own files, or public ones (linking a file shows it
   * to everyone who can read the story)
   */
  async attachAttachments(
    storyId: number,
    dto: AttachAttachmentsDto,
    currentUser: User
  ): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'attachments', currentUser)

    const attachments = await this.attachmentRepository.findMany({
      where: { id: In(dto.attachmentIds) }
    })
    if (attachments.length !== dto.attachmentIds.length) {
      throw new BadRequestException('One or more attachments not found')
    }
    for (const attachment of attachments) {
      if (attachment.userId !== currentUser.id && !attachment.isPublic) {
        throw new BadRequestException(`Attachment ${attachment.id} does not belong to you`)
      }
      assertAttachmentUsable(attachment)
    }

    return this.link(story, 'attachments', attachments, currentUser)
  }

  /**
   * Detach attachments from story
   */
  async detachAttachments(
    storyId: number,
    dto: DetachAttachmentsDto,
    currentUser: User
  ): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'attachments', currentUser)
    return this.unlink(story, 'attachments', dto.attachmentIds, currentUser)
  }

  /**
   * Attach tags to story, by id or by name (missing names are created)
   */
  async attachTags(storyId: number, dto: AttachTagsDto, currentUser: User): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'tags', currentUser)
    this.requireSomeTags(dto)
    const tags = await this.resolveAndCreateTags(dto.tagIds, dto.tags, currentUser.id)
    return this.link(story, 'tags', tags, currentUser)
  }

  /**
   * Detach tags from story, by id or by name
   */
  async detachTags(storyId: number, dto: DetachTagsDto, currentUser: User): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'tags', currentUser)
    this.requireSomeTags(dto)
    // No user: names that do not exist are skipped, never created
    const tags = await this.resolveAndCreateTags(dto.tagIds, dto.tags)
    return this.unlink(
      story,
      'tags',
      tags.map(tag => tag.id),
      currentUser
    )
  }

  /**
   * Attach categories to story
   */
  async attachCategories(
    storyId: number,
    dto: AttachCategoriesDto,
    currentUser: User
  ): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'categories', currentUser)

    const categories = await this.categoryRepository.findMany({
      where: { id: In(dto.categoryIds) }
    })
    if (categories.length !== dto.categoryIds.length) {
      throw new BadRequestException('One or more categories not found')
    }

    return this.link(story, 'categories', categories, currentUser)
  }

  /**
   * Detach categories from story
   */
  async detachCategories(
    storyId: number,
    dto: DetachCategoriesDto,
    currentUser: User
  ): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'categories', currentUser)
    return this.unlink(story, 'categories', dto.categoryIds, currentUser)
  }

  /**
   * Get story attachments (not the deleted ones)
   */
  async getAttachments(storyId: number, viewer: User): Promise<Attachment[]> {
    const story = await this.loadReadable(storyId, 'attachments', viewer)
    return (story.attachments ?? [])
      .filter(attachment => !attachment.deletedAt)
      .map(attachment => toAttachmentResponse(attachment) as unknown as Attachment)
  }

  /**
   * Get story tags
   */
  async getTags(storyId: number, viewer: User): Promise<Tag[]> {
    return (await this.loadReadable(storyId, 'tags', viewer)).tags ?? []
  }

  /**
   * Get story categories
   */
  async getCategories(storyId: number, viewer: User): Promise<Category[]> {
    return (await this.loadReadable(storyId, 'categories', viewer)).categories ?? []
  }

  /** The story with one relation loaded; 404 when missing or soft-deleted */
  private async loadStory(storyId: number, relation: Relation): Promise<Story> {
    const story = await this.storyRepository.findWithRelations(storyId, { [relation]: true })
    if (!story || story.deletedAt) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }
    return story
  }

  /** 404, like a missing story, when the viewer may not read it */
  private async loadReadable(storyId: number, relation: Relation, viewer: User): Promise<Story> {
    const story = await this.loadStory(storyId, relation)
    this.accessPolicy.assertCanRead(viewer, story)
    return story
  }

  private async loadForUpdate(storyId: number, relation: Relation, user: User): Promise<Story> {
    const story = await this.loadStory(storyId, relation)
    this.accessPolicy.assertCan(
      user,
      Action.Update,
      story,
      'You do not have permission to modify this story'
    )
    return story
  }

  /** Adds the items not linked yet and saves when anything was added */
  private async link(
    story: Story,
    relation: Relation,
    items: Linked[],
    user: User
  ): Promise<Story> {
    const current = (story[relation] ?? []) as Linked[]
    const linkedIds = new Set(current.map(item => item.id))
    const added = items.filter(item => !linkedIds.has(item.id))

    if (added.length > 0) {
      Object.assign(story, { [relation]: [...current, ...added], updatedBy: user.id })
      await this.storyRepository.save(story)
    }
    this.logger.info(
      { action: `attach_${relation}`, storyId: story.id, userId: user.id, attached: added.length },
      'Story links added'
    )
    return story
  }

  /** Removes the given ids and saves when anything was removed */
  private async unlink(
    story: Story,
    relation: Relation,
    ids: Array<string | number>,
    user: User
  ): Promise<Story> {
    const current = (story[relation] ?? []) as Linked[]
    const remove = new Set(ids)
    const kept = current.filter(item => !remove.has(item.id))

    if (kept.length !== current.length) {
      Object.assign(story, { [relation]: kept, updatedBy: user.id })
      await this.storyRepository.save(story)
    }
    this.logger.info(
      {
        action: `detach_${relation}`,
        storyId: story.id,
        userId: user.id,
        detached: current.length - kept.length
      },
      'Story links removed'
    )
    return story
  }

  private requireSomeTags(dto: { tagIds?: number[]; tags?: string[] }): void {
    if (!dto.tagIds?.length && !dto.tags?.length) {
      throw new BadRequestException('At least one tag ID or tag name must be provided')
    }
  }
}
