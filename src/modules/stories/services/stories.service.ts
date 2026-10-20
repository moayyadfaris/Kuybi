import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { errorMessage } from '@shared/utils/error.util'
import { PinoLogger } from 'nestjs-pino'

import { Action } from '@modules/acl'
import { User } from '@modules/users/entities'

import { MetricsService } from '@core/observability/metrics.service'

import {
  CreateStoryDto,
  StoryFilterDto,
  StoryListQueryDto,
  StoryStatsDto,
  UpdateStoryDto
} from '../dto'
import { Story, StoryStatus, StoryType } from '../entities/story.entity'
import { VersionType } from '../entities/story-version.entity'
import { StoryRepository } from '../repositories/story.repository'
import { assertStatusTransition } from '../story-status.rules'

import { StoryAccessPolicy } from './story-access.policy'
import { StoryEnrichmentService } from './story-enrichment.service'
import { StoryRelationshipService } from './story-relationship.service'
import { StoryVersionService } from './story-version.service'

const DEFAULT_PAGE_SIZE = 20

/**
 * Creating, reading and editing stories. Reads return only what the viewer may see
 * (StoryAccessPolicy: hidden stories are 404, staff fields only for editors).
 *
 * Related: StoryLifecycleService (delete, restore, status), StoryMediaService (main image),
 * StoryRelationshipService (tags, categories, attachments).
 */
@Injectable()
export class StoriesService {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly storyRelationshipService: StoryRelationshipService,
    private readonly storyEnrichmentService: StoryEnrichmentService,
    private readonly logger: PinoLogger,
    private readonly versionService: StoryVersionService,
    private readonly accessPolicy: StoryAccessPolicy,
    private readonly metricsService: MetricsService
  ) {
    this.logger.setContext(StoriesService.name)
  }

  /**
   * Lookups and validation run first; the story row and its tag/category links are then
   * written in one transaction, which clears the story caches once it commits.
   */
  async create(createStoryDto: CreateStoryDto, currentUser: User): Promise<Story> {
    const userId = currentUser.id
    const { categoryIds, tagIds, tags, ...storyData } = createStoryDto
    storyData.status = storyData.status ?? StoryStatus.DRAFT

    // Authors may create drafts or submit for review; anything else needs Publish
    assertStatusTransition(undefined, storyData.status)
    this.accessPolicy.assertCanSetStatus(currentUser, storyData.status)

    if (storyData.parentId) {
      await this.assertParentExists(storyData.parentId)
    }
    const categories = categoryIds?.length
      ? await this.storyRelationshipService.resolveCategories(categoryIds)
      : []
    // Tags are shared and created idempotently, so creating one before the story is safe
    const resolvedTags =
      tagIds?.length || tags?.length
        ? await this.storyRelationshipService.resolveAndCreateTags(tagIds, tags, userId)
        : []

    const storyId = await this.storyRepository.transaction(
      async manager => {
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
      },
      { touched: [] }
    )

    const created = await this.findOne(storyId, { bypassCache: true })
    this.metricsService.incrementStoryCreated(created.type, created.status)
    this.logger.info(
      { action: 'create_story', storyId, userId, type: created.type, status: created.status },
      'Story created'
    )
    return created
  }

  /** Stories the viewer may read, filtered and paginated */
  async findAll(filters: StoryFilterDto, viewer: User) {
    const result = await this.storyRepository.search({
      scope: this.accessPolicy.readScope(viewer),
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

    return { ...result, results: this.present(viewer, result.results) }
  }

  /**
   * A live story with its media enriched, regardless of who asks: for internal use and
   * for write paths that check access themselves. 404 when missing or soft-deleted.
   */
  async findOne(id: number, options?: { bypassCache?: boolean }): Promise<Story> {
    const story = await this.storyRepository.findById(id, options)
    if (!story || story.deletedAt) {
      throw new NotFoundException(`Story with ID ${id} not found`)
    }
    return this.storyEnrichmentService.enrichStoryMedia(story)
  }

  /** A story as the viewer may see it; 404 when it is missing, deleted or hidden from them */
  async findVisible(id: number, viewer: User): Promise<Story> {
    const story = await this.findOne(id)
    this.accessPolicy.assertCanRead(viewer, story)
    return this.accessPolicy.forViewer(viewer, story)
  }

  async findByUser(userId: string, viewer: User, query: StoryListQueryDto): Promise<Story[]> {
    const stories = await this.storyRepository.findByUser(
      userId,
      this.accessPolicy.readScope(viewer),
      { ...this.paging(query), includeDeleted: query.includeDeleted }
    )
    return this.present(viewer, stories)
  }

  async findByStatus(
    status: StoryStatus,
    viewer: User,
    query: StoryListQueryDto
  ): Promise<Story[]> {
    const stories = await this.storyRepository.findByStatus(
      status,
      this.accessPolicy.readScope(viewer),
      this.paging(query)
    )
    return this.present(viewer, stories)
  }

  async findByType(type: StoryType, viewer: User, query: StoryListQueryDto): Promise<Story[]> {
    const stories = await this.storyRepository.findByType(
      type,
      this.accessPolicy.readScope(viewer),
      this.paging(query)
    )
    return this.present(viewer, stories)
  }

  /** Direct replies to a story (threads) */
  async findChildren(parentId: number, viewer: User, includeDeleted?: boolean): Promise<Story[]> {
    const stories = await this.storyRepository.findChildren(
      parentId,
      this.accessPolicy.readScope(viewer),
      { includeDeleted }
    )
    return this.present(viewer, stories)
  }

  /**
   * Field changes and the replacement tag/category sets are written in one transaction.
   * An automatic version is recorded after it commits (best effort), unless the caller
   * records its own (`recordVersion: false`, as a rollback does).
   */
  async update(
    id: number,
    updateStoryDto: UpdateStoryDto,
    currentUser: User,
    options: { recordVersion?: boolean } = {}
  ): Promise<Story> {
    const userId = currentUser.id
    const story = await this.findOne(id)
    this.accessPolicy.assertCanChange(
      currentUser,
      Action.Update,
      story,
      'You do not have permission to update this story'
    )

    const { tags, categoryIds, tagIds, ...updateData } = updateStoryDto

    // A status change through PATCH follows the same rules as PATCH /status: valid
    // transition, and Publish for editorial statuses
    if (updateData.status !== undefined && updateData.status !== story.status) {
      assertStatusTransition(story.status, updateData.status)
      this.accessPolicy.assertCanSetStatus(currentUser, updateData.status, story)
    }

    if (updateData.parentId && updateData.parentId !== story.parentId) {
      await this.assertParentExists(updateData.parentId, id)
    }

    // A non-empty list replaces the current set; omitted or empty leaves it unchanged
    const categories = categoryIds?.length
      ? await this.storyRelationshipService.resolveCategories(categoryIds)
      : undefined
    const resolvedTags =
      tagIds?.length || tags?.length
        ? await this.storyRelationshipService.resolveAndCreateTags(tagIds, tags, userId)
        : undefined

    await this.storyRepository.transaction(
      async manager => {
        const entity = await manager.findOne(Story, {
          where: { id },
          relations: { categories: true, tags: true }
        })
        if (!entity || entity.deletedAt) {
          // Removed between the read above and this write
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
      },
      { touched: [id] }
    )

    const updated = await this.findOne(id, { bypassCache: true })
    this.logger.info(
      { action: 'update_story', storyId: id, userId, version: updated.version },
      'Story updated'
    )

    if (options.recordVersion !== false) {
      try {
        await this.versionService.createVersion(
          updated,
          {
            versionType: VersionType.AUTO,
            versionLabel: `Auto version ${updated.version}`,
            commitMessage: 'Automatic version created after update'
          },
          userId
        )
      } catch (error) {
        this.logger.warn(
          { storyId: id, error: errorMessage(error) },
          'Failed to create automatic version'
        )
      }
    }

    return updated
  }

  /** Counts over the stories the viewer may read */
  getStats(viewer: User): Promise<StoryStatsDto> {
    return this.storyRepository.getStats(this.accessPolicy.readScope(viewer))
  }

  /**
   * The parent must be a live story and, when `childId` is given (re-parenting), must not
   * be that story or one of its descendants: the thread would become a cycle.
   */
  private async assertParentExists(parentId: number, childId?: number): Promise<void> {
    const parent = await this.storyRepository.findById(parentId)
    if (!parent || parent.deletedAt) {
      throw new BadRequestException(`Parent story with ID ${parentId} not found`)
    }
    if (childId === undefined) return
    const lineage = await this.storyRepository.findSelfAndAncestorIds(parentId)
    if (lineage.includes(childId)) {
      throw new BadRequestException('A story cannot be its own parent or the parent of its parents')
    }
  }

  private present(viewer: User, stories: Story[]): Story[] {
    return this.storyEnrichmentService
      .enrichStoriesCollection(stories)
      .map(story => this.accessPolicy.forViewer(viewer, story))
  }

  private paging(query: StoryListQueryDto): { limit: number; offset: number } {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE
    return { limit, offset: ((query.page ?? 1) - 1) * limit }
  }
}
