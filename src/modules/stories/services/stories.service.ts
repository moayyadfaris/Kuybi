import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { errorMessage, errorStack } from '@shared/utils/error.util'
import { PinoLogger } from 'nestjs-pino'
import { DataSource, In, IsNull } from 'typeorm'

import { Action } from '@modules/acl'
import { CategoryRepository } from '@modules/categories'
import { Tag } from '@modules/tags/entities'
import { User } from '@modules/users/entities'

import { LoggingContextService } from '@core/logging/logging-context.service'
import { MetricsService } from '@core/observability/metrics.service'

import { CreateStoryDto, StoryFilterDto, StoryStatsDto, UpdateStoryDto } from '../dto'
import { Story, StoryStatus, StoryType } from '../entities/story.entity'
import { VersionType } from '../entities/story-version.entity'
import { StoryRepository } from '../repositories/story.repository'

import { StoryAccessPolicy } from './story-access.policy'
import { StoryEnrichmentService } from './story-enrichment.service'
import { StoryRelationshipService } from './story-relationship.service'
import { StoryVersionService } from './story-version.service'

/**
 * Creating, reading and editing stories.
 *
 * Related: StoryLifecycleService (delete, restore, status), StoryMediaService (main image),
 * StoryRelationshipService (tags, categories, attachments).
 */
@Injectable()
export class StoriesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storyRepository: StoryRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly storyRelationshipService: StoryRelationshipService,
    private readonly storyEnrichmentService: StoryEnrichmentService,
    private readonly logger: PinoLogger,
    private readonly loggingContext: LoggingContextService,
    private readonly versionService: StoryVersionService,
    private readonly accessPolicy: StoryAccessPolicy,
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
            where: { id: In(categoryIds), deletedAt: IsNull() }
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
          { action: 'create_story', userId, error: errorMessage(error), stack: errorStack(error) },
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

        if (!this.accessPolicy.can(currentUser, Action.Update, story)) {
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
        if (!updated) {
          // Removed between the existence check above and the update
          throw new NotFoundException(`Story with ID ${id} not found`)
        }

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
          { action: 'update_story', storyId: id, userId, error: errorMessage(error) },
          'Failed to update story - transaction rolled back'
        )
        throw error
      }
    })
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
}
