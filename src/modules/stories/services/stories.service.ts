import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PinoLogger } from 'nestjs-pino'
import { DataSource, In, Repository } from 'typeorm'

import { AbilityFactory } from '@modules/acl/abilities/ability.factory'
import { Action } from '@modules/acl/types/actions.enum'
import { Subject } from '@modules/acl/types/subjects.enum'
import { S3Service } from '@modules/attachments/services/s3.service'
import { AttachmentMetadata } from '@modules/attachments/utils/attachment-image.util'
import { CreateStoryDto, StoryFilterDto, StoryStatsDto, UpdateStoryDto } from '@modules/stories/dto'
import { Story, StoryStatus, StoryType } from '@modules/stories/entities/story.entity'
import { Tag } from '@modules/tags/entities/tag.entity'
import { User } from '@modules/users/entities/user.entity'

import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { CategoryRepository } from '@core/database/repositories/category.repository'
import { StoryRepository } from '@core/database/repositories/story.repository'
import { LoggingContextService } from '@core/logging/logging-context.service'
import { MetricsService } from '@core/observability/metrics.service'

import { VersionType } from '../entities/story-version.entity'

import { StoryEnrichmentService } from './story-enrichment.service'
import { StoryRelationshipService } from './story-relationship.service'
import { StoryVersionService } from './story-version.service'

@Injectable()
export class StoriesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storyRepository: StoryRepository,
    @InjectRepository(Story)
    private readonly storyEntityRepository: Repository<Story>,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly storyRelationshipService: StoryRelationshipService,
    private readonly storyEnrichmentService: StoryEnrichmentService,
    private readonly logger: PinoLogger,
    private readonly loggingContext: LoggingContextService,
    private readonly versionService: StoryVersionService,
    private readonly s3Service: S3Service,
    private readonly abilityFactory: AbilityFactory,
    private readonly metricsService: MetricsService
  ) {
    this.logger.setContext(StoriesService.name)
  }

  /**
   * Create a new story
   */
  async create(createStoryDto: CreateStoryDto, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const requestLogger = this.loggingContext.getLogger({
      context: StoriesService.name,
      action: 'create_story'
    })
    requestLogger.info({ userId, type: createStoryDto.type }, 'Creating story')
    requestLogger.debug(
      {
        title: createStoryDto.title,
        status: createStoryDto.status,
        priority: createStoryDto.priority,
        hasTags: Boolean(createStoryDto.tags?.length),
        hasTagIds: Boolean(createStoryDto.tagIds?.length),
        hasCategories: Boolean(createStoryDto.categoryIds?.length)
      },
      'Story creation payload summary'
    )

    // Wrap entire create operation in a transaction
    return await this.dataSource.transaction(async transactionalEntityManager => {
      try {
        // Validate parent story exists if parentId provided
        if (createStoryDto.parentId) {
          requestLogger.debug({ parentId: createStoryDto.parentId }, 'Validating parent story')
          const parent = await this.storyRepository.findById(createStoryDto.parentId)
          if (!parent) {
            throw new BadRequestException(
              `Parent story with ID ${createStoryDto.parentId} not found`
            )
          }
        }

        // Extract categoryIds, tagIds, and tags from DTO
        const { categoryIds, tagIds, tags, ...storyData } = createStoryDto
        requestLogger.debug(
          {
            categoryIds,
            tagIds,
            tagCount: tags?.length,
            storyDataKeys: Object.keys(storyData)
          },
          'Extracted data from DTO'
        )
        const story = await this.storyRepository.create({
          ...storyData,
          fromTime: createStoryDto.fromTime ? new Date(createStoryDto.fromTime) : undefined,
          toTime: createStoryDto.toTime ? new Date(createStoryDto.toTime) : undefined,
          userId,
          createdBy: userId,
          lastModifiedBy: userId
        })
        requestLogger.debug({ storyId: story.id }, 'Story created in database')

        // Get story with relations for attaching categories and tags
        const storyWithRelations = await transactionalEntityManager.findOne(Story, {
          where: { id: story.id },
          relations: ['categories', 'tags']
        })

        if (!storyWithRelations) {
          throw new BadRequestException('Failed to create story')
        }
        requestLogger.debug({ storyId: story.id }, 'Fetched story with relations')

        // Attach categories if provided
        if (categoryIds && categoryIds.length > 0) {
          requestLogger.debug({ categoryIds, count: categoryIds.length }, 'Processing categories')
          const categories = await this.categoryRepository.findMany({
            where: { id: In(categoryIds), deletedAt: null }
          })

          if (categories.length !== categoryIds.length) {
            requestLogger.warn(
              { action: 'create_story', requested: categoryIds.length, found: categories.length },
              'Some categories not found'
            )
          }

          storyWithRelations.categories = categories
          requestLogger.debug(
            { categoriesAttached: categories.length },
            'Categories attached to story'
          )
        }

        // Attach tags if provided
        let attachedTags: Tag[] = []
        if ((tagIds && tagIds.length > 0) || (tags && tags.length > 0)) {
          requestLogger.debug(
            {
              tagIds,
              tagNames: tags,
              tagIdsCount: tagIds?.length,
              tagNamesCount: tags?.length
            },
            'Processing tags'
          )
          try {
            attachedTags = await this.storyRelationshipService.resolveAndCreateTags(
              tagIds,
              tags,
              userId
            )
            requestLogger.debug({ tagsResolved: attachedTags.length }, 'Tags resolved and attached')
            storyWithRelations.tags = attachedTags
          } catch (tagError) {
            requestLogger.error({ error: tagError, tagIds, tagNames: tags }, 'Error resolving tags')
            throw tagError
          }
        }

        // Save story with relations within transaction
        if ((categoryIds && categoryIds.length > 0) || attachedTags.length > 0) {
          requestLogger.debug(
            {
              storyId: story.id,
              categoriesCount: categoryIds?.length,
              tagsCount: attachedTags.length
            },
            'Saving story with relations'
          )
          await transactionalEntityManager.save(Story, storyWithRelations)
          requestLogger.debug({ storyId: story.id }, 'Story with relations saved')

          await this.storyRepository.invalidateStoryCache(story.id, userId)
        }

        requestLogger.info(
          {
            storyId: story.id,
            userId,
            type: story.type,
            categoriesCount: categoryIds?.length || 0,
            tagsCount: attachedTags.length
          },
          'Story created successfully'
        )

        const finalStory = await this.findOne(story.id, userId, { bypassCache: true })

        // Record business metric
        this.metricsService.incrementStoryCreated(finalStory.type, finalStory.status)

        requestLogger.info({ storyId: story.id, userId }, 'Story creation completed successfully')
        return this.storyEnrichmentService.enrichStoryMedia(finalStory) as Story
      } catch (error) {
        requestLogger.error(
          { action: 'create_story', userId, error: error.message, stack: error.stack },
          'Failed to create story - transaction rolled back'
        )
        throw error
      }
    })
  }

  /**
   * Find all stories with pagination and filters
   */
  async findAll(filters: StoryFilterDto) {
    this.logger.debug({ action: 'find_all_stories', filters }, 'Finding stories with filters')

    const result = await this.storyRepository.search({
      search: filters.search,
      status: filters.status,
      type: filters.type,
      userId: filters.userId,
      priority: filters.priority,
      countryId: filters.countryId,
      parentId: filters.parentId,
      categoryIds: filters.categoryIds,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      includeDeleted: filters.includeDeleted,
      page: filters.page,
      limit: filters.limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    })

    return {
      ...result,
      results: this.storyEnrichmentService.enrichStoriesCollection(result.results)
    }
  }

  /**
   * Find story by ID
   */
  async findOne(id: number, userId?: string, options?: { bypassCache?: boolean }): Promise<Story> {
    this.logger.debug({ action: 'find_story', storyId: id, userId }, 'Finding story by ID')

    const story = await this.storyRepository.findById(id, options)

    if (!story || story.deletedAt) {
      throw new NotFoundException(`Story with ID ${id} not found`)
    }

    return this.storyEnrichmentService.enrichStoryMedia(story) as Story
  }

  /**
   * Find stories by user ID
   */
  async findByUser(
    userId: string,
    options?: {
      includeDeleted?: boolean
      limit?: number
      page?: number
    }
  ): Promise<Story[]> {
    this.logger.debug({ action: 'find_by_user', userId, options }, 'Finding stories by user')

    const offset = options?.page ? (options.page - 1) * (options?.limit || 20) : undefined

    const stories = await this.storyRepository.findByUser(userId, {
      includeDeleted: options?.includeDeleted,
      limit: options?.limit,
      offset
    })

    return this.storyEnrichmentService.enrichStoriesCollection(stories)
  }

  /**
   * Find stories by status
   */
  async findByStatus(
    status: StoryStatus,
    options?: {
      limit?: number
      page?: number
    }
  ): Promise<Story[]> {
    this.logger.debug({ action: 'find_by_status', status, options }, 'Finding stories by status')

    const offset = options?.page ? (options.page - 1) * (options?.limit || 20) : undefined

    const stories = await this.storyRepository.findByStatus(status, {
      limit: options?.limit,
      offset
    })

    return this.storyEnrichmentService.enrichStoriesCollection(stories)
  }

  /**
   * Find stories by type
   */
  async findByType(
    type: StoryType,
    options?: {
      limit?: number
      page?: number
    }
  ): Promise<Story[]> {
    this.logger.debug({ action: 'find_by_type', type, options }, 'Finding stories by type')

    const offset = options?.page ? (options.page - 1) * (options?.limit || 20) : undefined

    const stories = await this.storyRepository.findByType(type, {
      limit: options?.limit,
      offset
    })

    return this.storyEnrichmentService.enrichStoriesCollection(stories)
  }

  /**
   * Find child stories (threaded stories)
   */
  async findChildren(parentId: number, includeDeleted?: boolean): Promise<Story[]> {
    this.logger.debug(
      { action: 'find_children', parentId, includeDeleted },
      'Finding child stories'
    )

    const stories = await this.storyRepository.findChildren(parentId, { includeDeleted })

    return this.storyEnrichmentService.enrichStoriesCollection(stories)
  }

  /**
   * Update story
   */
  async update(id: number, updateStoryDto: UpdateStoryDto, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    this.logger.info({ action: 'update_story', storyId: id, userId }, 'Updating story')

    // Wrap update operation in a transaction
    return await this.dataSource.transaction(async _transactionalEntityManager => {
      try {
        const story = await this.findOne(id)

        // Check permissions using CASL
        const ability = this.abilityFactory.createForUser(currentUser)
        if (!ability.can(Action.Update, story)) {
          this.logger.warn(
            {
              action: 'update_story',
              storyId: id,
              ownerId: story.userId,
              requesterId: userId
            },
            'Update denied due to insufficient permissions'
          )
          throw new ForbiddenException('You do not have permission to update this story')
        }

        // Validate parent story if being changed
        if (updateStoryDto.parentId && updateStoryDto.parentId !== story.parentId) {
          const parent = await this.storyRepository.findById(updateStoryDto.parentId)
          if (!parent) {
            throw new BadRequestException(
              `Parent story with ID ${updateStoryDto.parentId} not found`
            )
          }
          // Prevent circular references
          if (updateStoryDto.parentId === id) {
            throw new BadRequestException('Story cannot be its own parent')
          }
        }

        // Extract relationship fields that need special handling
        const { tags, categoryIds, tagIds, ...updateData } = updateStoryDto

        // Update basic story fields (excluding relationship arrays)
        const updated = await this.storyRepository.update(id, {
          ...updateData,
          fromTime: updateStoryDto.fromTime ? new Date(updateStoryDto.fromTime) : undefined,
          toTime: updateStoryDto.toTime ? new Date(updateStoryDto.toTime) : undefined,
          updatedBy: userId,
          lastModifiedBy: userId,
          version: story.version + 1
        })

        // Handle category updates if provided
        if (categoryIds !== undefined && categoryIds.length > 0) {
          // Detach all existing categories first, then attach new ones
          const existingStory = await this.storyRepository.findById(id)
          if (existingStory?.categories && existingStory.categories.length > 0) {
            await this.storyRelationshipService.detachCategories(
              id,
              { categoryIds: existingStory.categories.map(c => c.id) },
              currentUser
            )
          }
          await this.storyRelationshipService.attachCategories(id, { categoryIds }, currentUser)
        }

        // Handle tag updates if provided (tags by name)
        if (tags !== undefined && tags.length > 0) {
          const existingStory = await this.storyRepository.findById(id)
          if (existingStory?.tags && existingStory.tags.length > 0) {
            await this.storyRelationshipService.detachTags(
              id,
              { tagIds: existingStory.tags.map(t => t.id) },
              currentUser
            )
          }
          await this.storyRelationshipService.attachTags(id, { tags }, currentUser)
        }

        // Handle tag updates by ID if provided
        if (tagIds !== undefined && tagIds.length > 0) {
          const existingStory = await this.storyRepository.findById(id)
          if (existingStory?.tags && existingStory.tags.length > 0) {
            await this.storyRelationshipService.detachTags(
              id,
              { tagIds: existingStory.tags.map(t => t.id) },
              currentUser
            )
          }
          await this.storyRelationshipService.attachTags(id, { tagIds }, currentUser)
        }

        this.logger.info(
          { action: 'update_story', storyId: id, userId, version: updated.version },
          'Story updated successfully'
        )

        // Create automatic version after update
        try {
          await this.versionService.createVersion(
            updated,
            {
              versionType: VersionType.AUTO,
              versionLabel: `Auto version ${updated.version}`,
              commitMessage: `Automatic version created after update`
            },
            userId
          )
          this.logger.debug({ storyId: id, version: updated.version }, 'Auto version created')
        } catch (versionError) {
          // Log but don't fail the update if versioning fails
          this.logger.warn(
            {
              storyId: id,
              error: versionError instanceof Error ? versionError.message : 'Unknown error'
            },
            'Failed to create automatic version'
          )
        }

        return this.storyEnrichmentService.enrichStoryMedia(updated) as Story
      } catch (error) {
        this.logger.error(
          { action: 'update_story', storyId: id, userId, error: error.message },
          'Failed to update story - transaction rolled back'
        )
        throw error
      }
    })
  }

  /**
   * Soft delete story
   */
  async remove(id: number, currentUser: User, reason?: string): Promise<void> {
    const userId = currentUser.id
    this.logger.info({ action: 'delete_story', storyId: id, userId, reason }, 'Deleting story')

    try {
      const story = await this.findOne(id)

      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Delete, story)) {
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
        { action: 'delete_story', storyId: id, userId, error: error.message },
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
      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Manage, Subject.All)) {
        throw new ForbiddenException('Only admins can permanently delete stories')
      }

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
        { action: 'hard_delete_story', storyId: id, userId, error: error.message },
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

      // Check permissions using CASL
      const ability = this.abilityFactory.createForUser(currentUser)
      if (!ability.can(Action.Restore, story)) {
        throw new ForbiddenException('You do not have permission to restore this story')
      }

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
        { action: 'restore_story', storyId: id, userId, error: error.message },
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
      const story = await this.findOne(id)

      // Validate status transition (simplified - in production, use state machine)
      this.validateStatusTransition(story.status, status)

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
        { action: 'update_status', storyId: id, userId, status, error: error.message },
        'Failed to update story status'
      )
      throw error
    }
  }

  /**
   * Get story statistics
   */
  async getStats(): Promise<StoryStatsDto> {
    this.logger.debug({ action: 'get_stats' }, 'Getting story statistics')

    const stats = await this.storyRepository.getStats()

    return {
      total: stats.total,
      byStatus: stats.byStatus,
      byType: stats.byType,
      byPriority: stats.byPriority,
      createdToday: stats.createdToday,
      createdThisWeek: stats.createdThisWeek,
      createdThisMonth: stats.createdThisMonth,
      published: stats.published,
      drafts: stats.drafts,
      deleted: stats.deleted
    }
  }

  /**
   * Validate status transition (simplified)
   * In production, implement proper state machine
   */
  private validateStatusTransition(currentStatus: StoryStatus, newStatus: StoryStatus): void {
    // Example validation - customize based on business rules
    if (currentStatus === StoryStatus.PUBLISHED && newStatus === StoryStatus.DRAFT) {
      throw new BadRequestException('Cannot revert published story to draft')
    }

    if (currentStatus === StoryStatus.DELETED && newStatus !== StoryStatus.DRAFT) {
      throw new BadRequestException('Deleted stories can only be restored to draft status')
    }
  }

  /**
   * Update story main image
   */
  async updateMainImage(storyId: number, attachmentId: string, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const requestLogger = this.loggingContext.getLogger({
      context: StoriesService.name,
      action: 'update_main_image'
    })

    requestLogger.info({ storyId, attachmentId, userId }, 'Updating story main image')

    // Find the story
    const story = await this.storyRepository.findById(storyId)
    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }

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
      context: StoriesService.name,
      action: 'remove_main_image'
    })

    requestLogger.info({ storyId, userId }, 'Removing story main image')

    // Find the story
    const story = await this.storyRepository.findById(storyId)
    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }

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
