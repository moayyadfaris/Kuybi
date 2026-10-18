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
import { Category } from '@modules/categories/entities'
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
   * Create a new story.
   *
   * Lookups and validation run first; the story row and its tag/category links are then
   * written in one transaction, and caches/metrics are updated only after it commits.
   */
  async create(createStoryDto: CreateStoryDto, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const requestLogger = this.loggingContext.getLogger({
      context: StoriesService.name,
      action: 'create_story'
    })
    requestLogger.info({ userId, type: createStoryDto.type }, 'Creating story')

    const { categoryIds, tagIds, tags, ...storyData } = createStoryDto

    try {
      if (storyData.parentId) {
        await this.assertParentExists(storyData.parentId)
      }
      const categories = categoryIds?.length ? await this.resolveCategories(categoryIds) : []
      // Tags are shared and created idempotently, so creating one before the story is safe
      const resolvedTags =
        tagIds?.length || tags?.length
          ? await this.storyRelationshipService.resolveAndCreateTags(tagIds, tags, userId)
          : []

      const storyId = await this.dataSource.transaction(async manager => {
        const story = manager.create(Story, {
          ...storyData,
          fromTime: storyData.fromTime ? new Date(storyData.fromTime) : undefined,
          toTime: storyData.toTime ? new Date(storyData.toTime) : undefined,
          userId,
          createdBy: userId,
          lastModifiedBy: userId,
          categories,
          tags: resolvedTags
        })
        return (await manager.save(story)).id
      })

      const created = await this.findOne(storyId, userId, { bypassCache: true })
      await this.storyRepository.invalidateAfterWrite(created)
      this.metricsService.incrementStoryCreated(created.type, created.status)

      requestLogger.info(
        {
          storyId,
          userId,
          type: created.type,
          categoriesCount: categories.length,
          tagsCount: resolvedTags.length
        },
        'Story created successfully'
      )
      return created
    } catch (error) {
      requestLogger.error(
        { action: 'create_story', userId, error: errorMessage(error), stack: errorStack(error) },
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
   * Update a story.
   *
   * Field changes and the replacement tag/category sets are written in one transaction;
   * the automatic version and cache invalidation happen after it commits.
   */
  async update(id: number, updateStoryDto: UpdateStoryDto, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    this.logger.info({ action: 'update_story', storyId: id, userId }, 'Updating story')

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

      const { tags, categoryIds, tagIds, ...updateData } = updateStoryDto

      if (updateData.parentId && updateData.parentId !== story.parentId) {
        if (updateData.parentId === id) {
          throw new BadRequestException('Story cannot be its own parent')
        }
        await this.assertParentExists(updateData.parentId)
      }

      // A non-empty list replaces the current set; omitted or empty leaves it unchanged
      const categories = categoryIds?.length ? await this.resolveCategories(categoryIds) : undefined
      const resolvedTags =
        tagIds?.length || tags?.length
          ? await this.storyRelationshipService.resolveAndCreateTags(tagIds, tags, userId)
          : undefined

      await this.dataSource.transaction(async manager => {
        const entity = await manager.findOne(Story, {
          where: { id },
          relations: ['categories', 'tags']
        })
        if (!entity || entity.deletedAt) {
          // Removed between the existence check above and this write
          throw new NotFoundException(`Story with ID ${id} not found`)
        }

        const changes = Object.fromEntries(
          Object.entries({
            ...updateData,
            fromTime: updateData.fromTime ? new Date(updateData.fromTime) : undefined,
            toTime: updateData.toTime ? new Date(updateData.toTime) : undefined
          }).filter(([, value]) => value !== undefined)
        )
        manager.merge(Story, entity, changes)
        entity.updatedBy = userId
        entity.lastModifiedBy = userId
        entity.version += 1
        if (categories) entity.categories = categories
        if (resolvedTags) entity.tags = resolvedTags

        await manager.save(entity)
      })

      const updated = await this.findOne(id, userId, { bypassCache: true })
      await this.storyRepository.invalidateAfterWrite(story, updated)

      this.logger.info(
        { action: 'update_story', storyId: id, userId, version: updated.version },
        'Story updated successfully'
      )

      // Create automatic version after update (best effort, outside the transaction)
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
        this.logger.warn(
          { storyId: id, error: errorMessage(versionError) },
          'Failed to create automatic version'
        )
      }

      return updated
    } catch (error) {
      this.logger.error(
        { action: 'update_story', storyId: id, userId, error: errorMessage(error) },
        'Failed to update story'
      )
      throw error
    }
  }

  private async assertParentExists(parentId: number): Promise<void> {
    const parent = await this.storyRepository.findById(parentId)
    if (!parent || parent.deletedAt) {
      throw new BadRequestException(`Parent story with ID ${parentId} not found`)
    }
  }

  private async resolveCategories(categoryIds: string[]): Promise<Category[]> {
    const categories = await this.categoryRepository.findMany({
      where: { id: In(categoryIds), deletedAt: IsNull() }
    })
    if (categories.length !== new Set(categoryIds).size) {
      throw new BadRequestException('One or more categories not found')
    }
    return categories
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
