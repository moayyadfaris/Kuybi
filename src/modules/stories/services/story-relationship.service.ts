import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { isUniqueViolation } from '@shared/utils/database-error.util'
import { PinoLogger } from 'nestjs-pino'
import { In, IsNull } from 'typeorm'

import { Action } from '@modules/acl'
import { assertAttachmentUsable, AttachmentRepository } from '@modules/attachments'
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
import { StoryEnrichmentService } from './story-enrichment.service'

type Relation = 'attachments' | 'tags' | 'categories'
type Linked = { id: string | number }

/**
 * A story's tags, categories and attachments: resolving them from request ids or names,
 * linking and unlinking (needs Update on the story) and reading them (needs Read).
 * Link changes return the whole story, as GET /stories/:id would.
 */
@Injectable()
export class StoryRelationshipService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly tagRepository: TagRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly storyEnrichmentService: StoryEnrichmentService,
    private readonly logger: PinoLogger,
    private readonly accessPolicy: StoryAccessPolicy
  ) {
    this.logger.setContext(StoryRelationshipService.name)
  }

  /**
   * Tags by id (all must exist) and by name. Names are trimmed and lowercased; missing
   * names are created, and a name another request created first is read back instead.
   */
  async resolveAndCreateTags(
    tagIds: number[] = [],
    tagNames: string[] = [],
    userId: string
  ): Promise<Tag[]> {
    const resolved = new Map<number, Tag>()
    for (const tag of await this.findTagsById(tagIds)) resolved.set(tag.id, tag)

    const names = normalizeTagNames(tagNames)
    const existing = await this.findTagsByName(names)
    for (const tag of existing) resolved.set(tag.id, tag)

    const existingNames = new Set(existing.map(tag => tag.name))
    const missing = names.filter(name => !existingNames.has(name))
    for (const name of missing) {
      const tag = await this.createTag(name, userId)
      resolved.set(tag.id, tag)
    }

    return [...resolved.values()]
  }

  /** Live (not soft-deleted) categories by id; 400 when any is missing */
  async resolveCategories(categoryIds: string[]): Promise<Category[]> {
    const ids = [...new Set(categoryIds)]
    const categories = await this.categoryRepository.findMany({
      where: { id: In(ids), deletedAt: IsNull() }
    })
    if (categories.length !== ids.length) {
      throw new BadRequestException('One or more categories not found')
    }
    return categories
  }

  /**
   * Your own files, or public ones (linking a file shows it to everyone who can read the
   * story)
   */
  async attachAttachments(
    storyId: number,
    dto: AttachAttachmentsDto,
    currentUser: User
  ): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'attachments', currentUser)

    const ids = [...new Set(dto.attachmentIds)]
    const attachments = await this.attachmentRepository.findMany({ where: { id: In(ids) } })
    if (attachments.length !== ids.length) {
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

  async detachAttachments(
    storyId: number,
    dto: DetachAttachmentsDto,
    currentUser: User
  ): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'attachments', currentUser)
    return this.unlink(story, 'attachments', dto.attachmentIds, currentUser)
  }

  /** By id or by name (missing names are created) */
  async attachTags(storyId: number, dto: AttachTagsDto, currentUser: User): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'tags', currentUser)
    requireSomeTags(dto)
    const tags = await this.resolveAndCreateTags(dto.tagIds, dto.tags, currentUser.id)
    return this.link(story, 'tags', tags, currentUser)
  }

  /** By id or by name; names that match no tag are ignored */
  async detachTags(storyId: number, dto: DetachTagsDto, currentUser: User): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'tags', currentUser)
    requireSomeTags(dto)
    const byName = await this.findTagsByName(normalizeTagNames(dto.tags ?? []))
    const ids = [...(dto.tagIds ?? []), ...byName.map(tag => tag.id)]
    return this.unlink(story, 'tags', ids, currentUser)
  }

  async attachCategories(
    storyId: number,
    dto: AttachCategoriesDto,
    currentUser: User
  ): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'categories', currentUser)
    const categories = await this.resolveCategories(dto.categoryIds)
    return this.link(story, 'categories', categories, currentUser)
  }

  async detachCategories(
    storyId: number,
    dto: DetachCategoriesDto,
    currentUser: User
  ): Promise<Story> {
    const story = await this.loadForUpdate(storyId, 'categories', currentUser)
    return this.unlink(story, 'categories', dto.categoryIds, currentUser)
  }

  /** The story's attachments that are not deleted */
  async getAttachments(storyId: number, viewer: User): Promise<Attachment[]> {
    const story = await this.loadReadable(storyId, 'attachments', viewer)
    return (story.attachments ?? [])
      .filter(attachment => !attachment.deletedAt)
      .map(attachment => this.storyEnrichmentService.present(attachment))
  }

  async getTags(storyId: number, viewer: User): Promise<Tag[]> {
    return (await this.loadReadable(storyId, 'tags', viewer)).tags ?? []
  }

  async getCategories(storyId: number, viewer: User): Promise<Category[]> {
    return (await this.loadReadable(storyId, 'categories', viewer)).categories ?? []
  }

  private async findTagsById(ids: number[]): Promise<Tag[]> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return []
    const tags = await this.tagRepository.findMany({
      where: { id: In(unique), deletedAt: IsNull() }
    })
    if (tags.length !== unique.length) {
      const found = new Set(tags.map(tag => tag.id))
      const missing = unique.filter(id => !found.has(id))
      throw new BadRequestException(`Tags not found: ${missing.join(', ')}`)
    }
    return tags
  }

  private findTagsByName(names: string[]): Promise<Tag[]> {
    if (names.length === 0) return Promise.resolve([])
    return this.tagRepository.findMany({ where: { name: In(names), deletedAt: IsNull() } })
  }

  private async createTag(name: string, userId: string): Promise<Tag> {
    try {
      return await this.tagRepository.create({ name, createdBy: userId, updatedBy: userId })
    } catch (error) {
      // Another request created it since the lookup
      const existing = isUniqueViolation(error) ? await this.tagRepository.findByName(name) : null
      if (!existing) throw error
      return existing
    }
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
    this.accessPolicy.assertCanChange(
      user,
      Action.Update,
      story,
      'You do not have permission to modify this story'
    )
    return story
  }

  /** Adds the items not linked yet, saving only when something was added */
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
    return this.reload(story.id)
  }

  /** Removes the given ids, saving only when something was removed */
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
    return this.reload(story.id)
  }

  private async reload(storyId: number): Promise<Story> {
    const story = await this.storyRepository.findById(storyId, { bypassCache: true })
    if (!story) throw new NotFoundException(`Story with ID ${storyId} not found`)
    return this.storyEnrichmentService.enrichStoryMedia(story)
  }
}

/** Tag names as stored: trimmed, lowercased, once each */
function normalizeTagNames(names: string[]): string[] {
  return [...new Set(names.map(name => name.trim().toLowerCase()).filter(Boolean))]
}

function requireSomeTags(dto: { tagIds?: number[]; tags?: string[] }): void {
  if (!dto.tagIds?.length && !dto.tags?.length) {
    throw new BadRequestException('At least one tag ID or tag name must be provided')
  }
}
