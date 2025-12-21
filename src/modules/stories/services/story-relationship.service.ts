import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PinoLogger } from 'nestjs-pino'
import { In, Repository } from 'typeorm'

import { AbilityFactory } from '@modules/acl/abilities/ability.factory'
import { Action } from '@modules/acl/types/actions.enum'
import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { toAttachmentResponse } from '@modules/attachments/utils/attachment-url.util'
import { Category } from '@modules/categories/entities/category.entity'
import {
  AttachAttachmentsDto,
  AttachCategoriesDto,
  AttachTagsDto,
  DetachAttachmentsDto,
  DetachCategoriesDto,
  DetachTagsDto
} from '@modules/stories/dto'
import { Story } from '@modules/stories/entities/story.entity'
import { Tag } from '@modules/tags/entities/tag.entity'
import { User } from '@modules/users/entities/user.entity'

import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { CategoryRepository } from '@core/database/repositories/category.repository'
import { StoryRepository } from '@core/database/repositories/story.repository'
import { TagRepository } from '@core/database/repositories/tag.repository'

@Injectable()
export class StoryRelationshipService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly tagRepository: TagRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly attachmentRepository: AttachmentRepository,
    @InjectRepository(Story)
    private readonly storyEntityRepository: Repository<Story>,
    private readonly logger: PinoLogger,
    private readonly abilityFactory: AbilityFactory
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

    const resolvedTags: Tag[] = []

    // Resolve tags by IDs
    if (tagIds && tagIds.length > 0) {
      this.logger.debug({ tagIds, count: tagIds.length }, 'Resolving tags by IDs')
      try {
        const tagsById = await Promise.all(
          tagIds.map(async id => {
            const tag = await this.tagRepository.findById(id)
            return tag
          })
        )

        const foundTags = tagsById.filter(Boolean) as Tag[]
        this.logger.debug(
          { foundCount: foundTags.length, requestedCount: tagIds.length },
          'Tags found by ID'
        )

        if (foundTags.length !== tagIds.length) {
          const foundIds = foundTags.map(t => t.id)
          const missingIds = tagIds.filter(id => !foundIds.includes(id))
          this.logger.warn({ missingIds }, 'Some tag IDs not found')
          throw new BadRequestException(`Tags not found: ${missingIds.join(', ')}`)
        }

        resolvedTags.push(...foundTags)
        this.logger.debug({ tagsAdded: foundTags.length }, 'Tags by ID added to resolved list')
      } catch (error) {
        this.logger.error({ error, tagIds }, 'Error resolving tags by ID')
        throw error
      }
    }

    // Resolve/create tags by names
    if (tagNames && tagNames.length > 0) {
      this.logger.debug({ tagNames, count: tagNames.length }, 'Processing tag names')
      for (const tagName of tagNames) {
        const normalizedName = tagName.trim().toLowerCase()

        try {
          // Try to find existing tag
          let tag = await this.tagRepository.findByName(normalizedName)

          // Create tag if it doesn't exist
          if (!tag && userId) {
            tag = await this.tagRepository.create({
              name: normalizedName,
              createdBy: userId,
              updatedBy: userId
            })

            this.logger.info(
              { action: 'create_tag', tagId: tag.id, name: normalizedName, userId },
              'Created new tag'
            )
          }

          if (tag) {
            // Avoid duplicates
            if (!resolvedTags.find(t => t.id === tag.id)) {
              resolvedTags.push(tag)
              this.logger.debug({ tagName: tag.name, tagId: tag.id }, 'Tag added to resolved list')
            } else {
              this.logger.debug({ tagName: tag.name }, 'Tag already in resolved list, skipping')
            }
          } else {
            this.logger.warn({ tagName: normalizedName }, 'Tag is null after processing')
          }
        } catch (tagError) {
          this.logger.error(
            { error: tagError, tagName: normalizedName },
            'Error processing tag name'
          )
          throw tagError
        }
      }
    }

    this.logger.debug(
      {
        totalTags: resolvedTags.length,
        tags: resolvedTags.map(t => ({ id: t.id, name: t.name }))
      },
      'Tags resolution complete'
    )
    return resolvedTags
  }

  /**
   * Attach attachments to story
   */
  async attachAttachments(
    storyId: number,
    dto: AttachAttachmentsDto,
    currentUser: User
  ): Promise<Story> {
    const userId = currentUser.id
    this.logger.info(
      { action: 'attach_attachments', storyId, userId, count: dto.attachmentIds.length },
      'Attaching attachments to story'
    )

    try {
      const story = await this.storyEntityRepository.findOne({
        where: { id: storyId },
        relations: ['attachments']
      })

      if (!story || story.deletedAt) {
        throw new NotFoundException(`Story with ID ${storyId} not found`)
      }

      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Update, story)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      // Verify all attachments exist
      const attachments = await this.attachmentRepository.findMany({
        where: { id: In(dto.attachmentIds) }
      })

      if (attachments.length !== dto.attachmentIds.length) {
        throw new BadRequestException('One or more attachments not found')
      }

      // Add new attachments (avoiding duplicates)
      const existingIds = story.attachments?.map(a => a.id) || []
      const newAttachments = attachments.filter(a => !existingIds.includes(a.id))

      story.attachments = [...(story.attachments || []), ...newAttachments]
      story.updatedBy = userId

      await this.storyEntityRepository.save(story)

      await this.storyRepository.invalidateStoryCache(storyId, userId)

      this.logger.info(
        { action: 'attach_attachments', storyId, userId, attached: newAttachments.length },
        'Attachments attached successfully'
      )

      return story
    } catch (error) {
      this.logger.error(
        { action: 'attach_attachments', storyId, userId, error: error.message },
        'Failed to attach attachments'
      )
      throw error
    }
  }

  /**
   * Detach attachments from story
   */
  async detachAttachments(
    storyId: number,
    dto: DetachAttachmentsDto,
    currentUser: User
  ): Promise<Story> {
    const userId = currentUser.id
    this.logger.info(
      { action: 'detach_attachments', storyId, userId, count: dto.attachmentIds.length },
      'Detaching attachments from story'
    )

    try {
      const story = await this.storyEntityRepository.findOne({
        where: { id: storyId },
        relations: ['attachments']
      })

      if (!story || story.deletedAt) {
        throw new NotFoundException(`Story with ID ${storyId} not found`)
      }

      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Update, story)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      if (!story.attachments || story.attachments.length === 0) {
        return story
      }

      const originalCount = story.attachments.length
      story.attachments = story.attachments.filter(a => !dto.attachmentIds.includes(a.id))
      story.updatedBy = userId

      if (story.attachments.length !== originalCount) {
        await this.storyEntityRepository.save(story)

        await this.storyRepository.invalidateStoryCache(storyId, userId)
      }

      this.logger.info(
        {
          action: 'detach_attachments',
          storyId,
          userId,
          detached: originalCount - story.attachments.length
        },
        'Attachments detached successfully'
      )

      return story
    } catch (error) {
      this.logger.error(
        { action: 'detach_attachments', storyId, userId, error: error.message },
        'Failed to detach attachments'
      )
      throw error
    }
  }

  /**
   * Attach tags to story
   */
  async attachTags(storyId: number, dto: AttachTagsDto, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const tagCount = (dto.tagIds?.length || 0) + (dto.tags?.length || 0)
    this.logger.info(
      { action: 'attach_tags', storyId, userId, count: tagCount },
      'Attaching tags to story'
    )

    try {
      const story = await this.storyEntityRepository.findOne({
        where: { id: storyId },
        relations: ['tags']
      })

      if (!story || story.deletedAt) {
        throw new NotFoundException(`Story with ID ${storyId} not found`)
      }

      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Update, story)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      // Validate that at least one type of tags is provided
      if ((!dto.tagIds || dto.tagIds.length === 0) && (!dto.tags || dto.tags.length === 0)) {
        throw new BadRequestException('At least one tag ID or tag name must be provided')
      }

      // Resolve tags by IDs and names
      const tagsToAttach = await this.resolveAndCreateTags(dto.tagIds, dto.tags, userId)

      // Add new tags (avoiding duplicates)
      const existingIds = story.tags?.map(t => t.id) || []
      const newTags = tagsToAttach.filter(t => !existingIds.includes(t.id))

      story.tags = [...(story.tags || []), ...newTags]
      story.updatedBy = userId

      await this.storyEntityRepository.save(story)

      await this.storyRepository.invalidateStoryCache(storyId, userId)

      this.logger.info(
        { action: 'attach_tags', storyId, userId, attached: newTags.length },
        'Tags attached successfully'
      )

      return story
    } catch (error) {
      this.logger.error(
        { action: 'attach_tags', storyId, userId, error: error.message },
        'Failed to attach tags'
      )
      throw error
    }
  }

  /**
   * Detach tags from story
   */
  async detachTags(storyId: number, dto: DetachTagsDto, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const tagCount = (dto.tagIds?.length || 0) + (dto.tags?.length || 0)
    this.logger.info(
      { action: 'detach_tags', storyId, userId, count: tagCount },
      'Detaching tags from story'
    )

    try {
      const story = await this.storyEntityRepository.findOne({
        where: { id: storyId },
        relations: ['tags']
      })

      if (!story || story.deletedAt) {
        throw new NotFoundException(`Story with ID ${storyId} not found`)
      }

      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Update, story)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      // Validate that at least one type of tags is provided
      if ((!dto.tagIds || dto.tagIds.length === 0) && (!dto.tags || dto.tags.length === 0)) {
        throw new BadRequestException('At least one tag ID or tag name must be provided')
      }

      // Resolve tags to detach
      const tagsToDetach = await this.resolveAndCreateTags(dto.tagIds, dto.tags)
      const detachIds = tagsToDetach.map(t => t.id)

      // Remove specified tags
      story.tags = story.tags?.filter(t => !detachIds.includes(t.id)) || []
      story.updatedBy = userId

      await this.storyEntityRepository.save(story)

      await this.storyRepository.invalidateStoryCache(storyId, userId)

      this.logger.info(
        { action: 'detach_tags', storyId, userId, detached: detachIds.length },
        'Tags detached successfully'
      )

      return story
    } catch (error) {
      this.logger.error(
        { action: 'detach_tags', storyId, userId, error: error.message },
        'Failed to detach tags'
      )
      throw error
    }
  }

  /**
   * Attach categories to story
   */
  async attachCategories(
    storyId: number,
    dto: AttachCategoriesDto,
    currentUser: User
  ): Promise<Story> {
    const userId = currentUser.id
    this.logger.info(
      { action: 'attach_categories', storyId, userId, count: dto.categoryIds.length },
      'Attaching categories to story'
    )

    try {
      const story = await this.storyEntityRepository.findOne({
        where: { id: storyId },
        relations: ['categories']
      })

      if (!story || story.deletedAt) {
        throw new NotFoundException(`Story with ID ${storyId} not found`)
      }

      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Update, story)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      // Verify all categories exist
      const categories = await this.categoryRepository.findMany({
        where: { id: In(dto.categoryIds) }
      })

      if (categories.length !== dto.categoryIds.length) {
        throw new BadRequestException('One or more categories not found')
      }

      // Add new categories (avoiding duplicates)
      const existingIds = story.categories?.map(c => c.id) || []
      const newCategories = categories.filter(c => !existingIds.includes(c.id))

      story.categories = [...(story.categories || []), ...newCategories]
      story.updatedBy = userId

      await this.storyEntityRepository.save(story)

      await this.storyRepository.invalidateStoryCache(storyId, userId)

      this.logger.info(
        { action: 'attach_categories', storyId, userId, attached: newCategories.length },
        'Categories attached successfully'
      )

      return story
    } catch (error) {
      this.logger.error(
        { action: 'attach_categories', storyId, userId, error: error.message },
        'Failed to attach categories'
      )
      throw error
    }
  }

  /**
   * Detach categories from story
   */
  async detachCategories(
    storyId: number,
    dto: DetachCategoriesDto,
    currentUser: User
  ): Promise<Story> {
    const userId = currentUser.id
    this.logger.info(
      { action: 'detach_categories', storyId, userId, count: dto.categoryIds.length },
      'Detaching categories from story'
    )

    try {
      const story = await this.storyEntityRepository.findOne({
        where: { id: storyId },
        relations: ['categories']
      })

      if (!story || story.deletedAt) {
        throw new NotFoundException(`Story with ID ${storyId} not found`)
      }

      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Update, story)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      if (!story.categories || story.categories.length === 0) {
        return story
      }

      const originalCount = story.categories.length
      story.categories = story.categories.filter(c => !dto.categoryIds.includes(c.id))
      story.updatedBy = userId

      if (story.categories.length !== originalCount) {
        await this.storyEntityRepository.save(story)

        await this.storyRepository.invalidateStoryCache(storyId, userId)
      }

      this.logger.info(
        {
          action: 'detach_categories',
          storyId,
          userId,
          detached: originalCount - story.categories.length
        },
        'Categories detached successfully'
      )

      return story
    } catch (error) {
      this.logger.error(
        { action: 'detach_categories', storyId, userId, error: error.message },
        'Failed to detach categories'
      )
      throw error
    }
  }

  /**
   * Get story attachments
   */
  async getAttachments(storyId: number): Promise<Attachment[]> {
    const story = await this.storyEntityRepository.findOne({
      where: { id: storyId },
      relations: ['attachments']
    })

    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }

    // Filter out soft deleted attachments if necessary, or check deletedAt
    // The relation query might return them depending on global filter settings
    // Explicitly filtering here just in case, assuming we want active ones
    const activeAttachments = story.attachments?.filter(a => !a.deletedAt) || []

    return activeAttachments.map(
      attachment => toAttachmentResponse(attachment) as unknown as Attachment
    )
  }

  /**
   * Get story tags
   */
  async getTags(storyId: number): Promise<Tag[]> {
    const story = await this.storyEntityRepository.findOne({
      where: { id: storyId },
      relations: ['tags']
    })

    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }

    return story.tags || []
  }

  /**
   * Get story categories
   */
  async getCategories(storyId: number): Promise<Category[]> {
    const story = await this.storyEntityRepository.findOne({
      where: { id: storyId },
      relations: ['categories']
    })

    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }

    return story.categories || []
  }
}
