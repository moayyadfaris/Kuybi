import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { PinoLogger } from 'nestjs-pino'
import { In, Repository } from 'typeorm'

import { Attachment } from '@modules/attachments/entities/attachment.entity'
import { S3Service } from '@modules/attachments/services/s3.service'
import { AttachmentMetadata } from '@modules/attachments/utils/attachment-image.util'
import { toAttachmentResponse } from '@modules/attachments/utils/attachment-url.util'
import { Category } from '@modules/categories/entities/category.entity'
import {
  AttachAttachmentsDto,
  AttachCategoriesDto,
  AttachTagsDto,
  CreateStoryDto,
  DetachAttachmentsDto,
  DetachCategoriesDto,
  DetachTagsDto,
  StoryFilterDto,
  StoryStatsDto,
  UpdateStoryDto
} from '@modules/stories/dto'
import { Story, StoryStatus, StoryType } from '@modules/stories/entities/story.entity'
import { Tag } from '@modules/tags/entities/tag.entity'

import { AttachmentRepository } from '@core/database/repositories/attachment.repository'
import { CategoryRepository } from '@core/database/repositories/category.repository'
import { StoryRepository } from '@core/database/repositories/story.repository'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { LoggingContextService } from '@core/logging/logging-context.service'

import { VersionType } from '../entities/story-version.entity'

import { StoryVersionService } from './story-version.service'

@Injectable()
export class StoriesService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly tagRepository: TagRepository,
    @InjectRepository(Story)
    private readonly storyEntityRepository: Repository<Story>,
    private readonly attachmentRepository: AttachmentRepository,
    private readonly categoryRepository: CategoryRepository,

    private readonly logger: PinoLogger,

    private readonly loggingContext: LoggingContextService,
    private readonly versionService: StoryVersionService,
    private readonly s3Service: S3Service
  ) {
    this.logger.setContext(StoriesService.name)
  }

  /**
   * Create a new story
   */
  async create(createStoryDto: CreateStoryDto, userId: string, userRole?: string): Promise<Story> {
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

    try {
      // Validate parent story exists if parentId provided
      if (createStoryDto.parentId) {
        requestLogger.debug({ parentId: createStoryDto.parentId }, 'Validating parent story')
        const parent = await this.storyRepository.findById(createStoryDto.parentId)
        if (!parent) {
          throw new BadRequestException(`Parent story with ID ${createStoryDto.parentId} not found`)
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
      const storyWithRelations = await this.storyEntityRepository.findOne({
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
          attachedTags = await this.resolveAndCreateTags(tagIds, tags, userId)
          requestLogger.debug({ tagsResolved: attachedTags.length }, 'Tags resolved and attached')
          storyWithRelations.tags = attachedTags
        } catch (tagError) {
          requestLogger.error({ error: tagError, tagIds, tagNames: tags }, 'Error resolving tags')
          throw tagError
        }
      }

      // Save story with relations
      if ((categoryIds && categoryIds.length > 0) || attachedTags.length > 0) {
        requestLogger.debug(
          {
            storyId: story.id,
            categoriesCount: categoryIds?.length,
            tagsCount: attachedTags.length
          },
          'Saving story with relations'
        )
        await this.storyEntityRepository.save(storyWithRelations)
        requestLogger.debug({ storyId: story.id }, 'Story with relations saved')

        const cacheSvc = (this.storyRepository as any)?.cacheService
        const buildKey = (this.storyRepository as any)?.buildCacheKey?.bind(this.storyRepository)
        if (cacheSvc && buildKey) {
          await cacheSvc.del(buildKey('id', story.id.toString()))
        }
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
      requestLogger.info({ storyId: story.id, userId }, 'Story creation completed successfully')
      return this.enrichStoryMedia(finalStory) as Story
    } catch (error) {
      requestLogger.error(
        { action: 'create_story', userId, error: error.message, stack: error.stack },
        'Failed to create story'
      )
      throw error
    }
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
      results: this.enrichStoriesCollection(result.results)
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

    return this.enrichStoryMedia(story) as Story
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

    return this.enrichStoriesCollection(stories)
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

    return this.enrichStoriesCollection(stories)
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

    return this.enrichStoriesCollection(stories)
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

    return this.enrichStoriesCollection(stories)
  }

  /**
   * Update story
   */
  async update(
    id: number,
    updateStoryDto: UpdateStoryDto,
    userId: string,
    userRole?: string
  ): Promise<Story> {
    this.logger.info({ action: 'update_story', storyId: id, userId }, 'Updating story')

    try {
      const story = await this.findOne(id)

      // Check ownership or admin permission (simplified - in production, use proper RBAC)
      if (story.userId !== userId && !this.isAdmin(userRole)) {
        this.logger.warn(
          {
            action: 'update_story',
            storyId: id,
            ownerId: story.userId,
            requesterId: userId
          },
          'Update denied due to ownership mismatch'
        )
        throw new ForbiddenException('You do not have permission to update this story')
      }

      // Validate parent story if being changed
      if (updateStoryDto.parentId && updateStoryDto.parentId !== story.parentId) {
        const parent = await this.storyRepository.findById(updateStoryDto.parentId)
        if (!parent) {
          throw new BadRequestException(`Parent story with ID ${updateStoryDto.parentId} not found`)
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
          await this.detachCategories(
            id,
            { categoryIds: existingStory.categories.map(c => c.id) },
            userId
          )
        }
        await this.attachCategories(id, { categoryIds }, userId)
      }

      // Handle tag updates if provided (tags by name)
      if (tags !== undefined && tags.length > 0) {
        const existingStory = await this.storyRepository.findById(id)
        if (existingStory?.tags && existingStory.tags.length > 0) {
          await this.detachTags(id, { tagIds: existingStory.tags.map(t => t.id) }, userId)
        }
        await this.attachTags(id, { tags }, userId)
      }

      // Handle tag updates by ID if provided
      if (tagIds !== undefined && tagIds.length > 0) {
        const existingStory = await this.storyRepository.findById(id)
        if (existingStory?.tags && existingStory.tags.length > 0) {
          await this.detachTags(id, { tagIds: existingStory.tags.map(t => t.id) }, userId)
        }
        await this.attachTags(id, { tagIds }, userId)
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

      return this.enrichStoryMedia(updated) as Story
    } catch (error) {
      this.logger.error(
        { action: 'update_story', storyId: id, userId, error: error.message },
        'Failed to update story'
      )
      throw error
    }
  }

  /**
   * Soft delete story
   */
  async remove(id: number, userId: string, reason?: string, userRole?: string): Promise<void> {
    this.logger.info({ action: 'delete_story', storyId: id, userId, reason }, 'Deleting story')

    try {
      const story = await this.findOne(id)

      // Check ownership or admin permission
      if (story.userId !== userId && !this.isAdmin(userRole)) {
        this.logger.warn(
          {
            action: 'delete_story',
            storyId: id,
            ownerId: story.userId,
            requesterId: userId
          },
          'Delete denied due to ownership mismatch'
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
  async hardDelete(id: number, userId: string, userRole?: string): Promise<void> {
    this.logger.warn(
      { action: 'hard_delete_story', storyId: id, userId },
      'Permanently deleting story'
    )

    try {
      if (!this.isAdmin(userRole)) {
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
  async restore(id: number, userId: string, userRole?: string): Promise<Story> {
    this.logger.info({ action: 'restore_story', storyId: id, userId }, 'Restoring story')

    try {
      const story = await this.storyRepository.findById(id)

      if (!story) {
        throw new NotFoundException(`Story with ID ${id} not found`)
      }

      if (!story.deletedAt) {
        throw new BadRequestException('Story is not deleted')
      }

      // Check ownership or admin permission
      if (story.userId !== userId && !this.isAdmin(userRole)) {
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

      return this.enrichStoryMedia(restored) as Story
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
  async updateStatus(id: number, status: StoryStatus, userId: string): Promise<Story> {
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

      return this.enrichStoryMedia(updated) as Story
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

  private enrichStoryAttachment(attachment?: Attachment | null): Attachment | undefined {
    if (!attachment) {
      return undefined
    }

    const enriched = toAttachmentResponse(attachment)
    return enriched as unknown as Attachment
  }

  private enrichStoryMedia<T extends Story | null | undefined>(story: T): T {
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

  private enrichStoriesCollection(stories: Story[]): Story[] {
    return stories.map(story => this.enrichStoryMedia(story) as Story)
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
   * Check if user is admin (simplified)
   * In production, use proper RBAC service
   */
  private isAdmin(userRole?: string): boolean {
    if (!userRole) return false
    return userRole.toLowerCase().includes('admin')
  }

  /**
   * Attach attachments to story
   */
  async attachAttachments(
    storyId: number,
    dto: AttachAttachmentsDto,
    userId: string,
    userRole?: string
  ): Promise<Story> {
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

      // Check ownership
      if (story.userId !== userId && !this.isAdmin(userRole)) {
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

      // Invalidate cache
      await this.storyRepository['cacheService'].del(
        this.storyRepository['buildCacheKey']('id', storyId.toString())
      )

      this.logger.info(
        { action: 'attach_attachments', storyId, userId, attached: newAttachments.length },
        'Attachments attached successfully'
      )

      return this.findOne(storyId, userId)
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
    userId: string,
    userRole?: string
  ): Promise<Story> {
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

      // Check ownership
      if (story.userId !== userId && !this.isAdmin(userRole)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      // Remove specified attachments
      story.attachments = story.attachments?.filter(a => !dto.attachmentIds.includes(a.id)) || []
      story.updatedBy = userId

      await this.storyEntityRepository.save(story)

      // Invalidate cache
      await this.storyRepository['cacheService'].del(
        this.storyRepository['buildCacheKey']('id', storyId.toString())
      )

      this.logger.info(
        { action: 'detach_attachments', storyId, userId },
        'Attachments detached successfully'
      )

      return this.findOne(storyId, userId)
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
  async attachTags(
    storyId: number,
    dto: AttachTagsDto,
    userId: string,
    userRole?: string
  ): Promise<Story> {
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

      // Check ownership
      if (story.userId !== userId && !this.isAdmin(userRole)) {
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

      // Invalidate cache
      await this.storyRepository['cacheService'].del(
        this.storyRepository['buildCacheKey']('id', storyId.toString())
      )

      this.logger.info(
        { action: 'attach_tags', storyId, userId, attached: newTags.length },
        'Tags attached successfully'
      )

      return this.findOne(storyId, userId)
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
  async detachTags(
    storyId: number,
    dto: DetachTagsDto,
    userId: string,
    userRole?: string
  ): Promise<Story> {
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

      // Check ownership
      if (story.userId !== userId && !this.isAdmin(userRole)) {
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

      // Invalidate cache
      await this.storyRepository['cacheService'].del(
        this.storyRepository['buildCacheKey']('id', storyId.toString())
      )

      this.logger.info(
        { action: 'detach_tags', storyId, userId, detached: detachIds.length },
        'Tags detached successfully'
      )

      return this.findOne(storyId, userId)
    } catch (error) {
      this.logger.error(
        { action: 'detach_tags', storyId, userId, error: error.message },
        'Failed to detach tags'
      )
      throw error
    }
  }

  /**
   * Get story attachments
   */
  async getAttachments(storyId: number): Promise<Attachment[]> {
    const story = await this.storyEntityRepository.findOne({
      where: { id: storyId, deletedAt: null },
      relations: ['attachments']
    })

    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }

    return (
      story.attachments?.map(
        attachment => toAttachmentResponse(attachment) as unknown as Attachment
      ) || []
    )
  }

  /**
   * Get story tags
   */
  async getTags(storyId: number): Promise<Tag[]> {
    const story = await this.storyEntityRepository.findOne({
      where: { id: storyId, deletedAt: null },
      relations: ['tags']
    })

    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }

    return story.tags || []
  }

  /**
   * Attach categories to story
   */
  async attachCategories(
    storyId: number,
    dto: AttachCategoriesDto,
    userId: string,
    userRole?: string
  ): Promise<Story> {
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

      // Check ownership
      if (story.userId !== userId && !this.isAdmin(userRole)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      // Verify all categories exist and are active
      const categories = await this.categoryRepository.findMany({
        where: { id: In(dto.categoryIds), deletedAt: null }
      })

      if (categories.length !== dto.categoryIds.length) {
        throw new BadRequestException('One or more categories not found or inactive')
      }

      // Add new categories (avoiding duplicates)
      const existingIds = story.categories?.map(c => c.id) || []
      const newCategories = categories.filter(c => !existingIds.includes(c.id))

      story.categories = [...(story.categories || []), ...newCategories]
      story.updatedBy = userId

      await this.storyEntityRepository.save(story)

      // Invalidate cache
      await this.storyRepository['cacheService'].del(
        this.storyRepository['buildCacheKey']('id', storyId.toString())
      )

      this.logger.info(
        { action: 'attach_categories', storyId, userId, attached: newCategories.length },
        'Categories attached successfully'
      )

      return this.findOne(storyId, userId)
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
    userId: string,
    userRole?: string
  ): Promise<Story> {
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

      // Check ownership
      if (story.userId !== userId && !this.isAdmin(userRole)) {
        throw new ForbiddenException('You do not have permission to modify this story')
      }

      // Remove specified categories
      story.categories = story.categories?.filter(c => !dto.categoryIds.includes(c.id)) || []
      story.updatedBy = userId

      await this.storyEntityRepository.save(story)

      // Invalidate cache
      await this.storyRepository['cacheService'].del(
        this.storyRepository['buildCacheKey']('id', storyId.toString())
      )

      this.logger.info(
        { action: 'detach_categories', storyId, userId },
        'Categories detached successfully'
      )

      return this.findOne(storyId, userId)
    } catch (error) {
      this.logger.error(
        { action: 'detach_categories', storyId, userId, error: error.message },
        'Failed to detach categories'
      )
      throw error
    }
  }

  /**
   * Get story categories
   */
  async getCategories(storyId: number): Promise<Category[]> {
    const story = await this.storyEntityRepository.findOne({
      where: { id: storyId, deletedAt: null },
      relations: ['categories']
    })

    if (!story) {
      throw new NotFoundException(`Story with ID ${storyId} not found`)
    }

    return story.categories || []
  }

  /**
   * Helper method to resolve tags by IDs and names, creating new tags if needed
   */
  private async resolveAndCreateTags(
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
      { totalTags: resolvedTags.length, tags: resolvedTags.map(t => ({ id: t.id, name: t.name })) },
      'Tags resolution complete'
    )
    return resolvedTags
  }

  /**
   * Update story main image
   */
  async updateMainImage(storyId: number, attachmentId: string, userId: string): Promise<Story> {
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
  async removeMainImage(storyId: number, userId: string): Promise<Story> {
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
