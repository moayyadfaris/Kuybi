import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, EntityManager, LessThan, Repository, SelectQueryBuilder } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { Attachment } from '../entities/attachment.entity'

export interface AttachmentQueryOptions {
  userId?: string
  category?: string
  mimeType?: string
  isPublic?: boolean
  securityStatus?: string
  minSize?: number
  maxSize?: number
  startDate?: Date
  endDate?: Date
  includeDeleted?: boolean
  tags?: string[]
  /** Only files this user owns or that are public */
  visibleToUserId?: string
}

@Injectable()
export class AttachmentRepository extends BaseRepository<Attachment> {
  protected entityName = 'attachment'
  protected defaultTTL = 600 // 10 minutes cache

  constructor(
    @InjectRepository(Attachment)
    repository: Repository<Attachment>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Wrapper for cache operations
   */
  private async withCache<T>(
    cacheKey: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    if (this.cacheService) {
      return this.cached(cacheKey, factory, ttl || this.defaultTTL)
    }
    return factory()
  }

  /**
   * Find attachment by ID with optional soft delete inclusion
   */
  async findByIdWithOptions(id: string, includeDeleted = false): Promise<Attachment | null> {
    if (!includeDeleted) {
      // Use base findById for normal queries
      return this.findById(id)
    }

    // For queries including deleted records
    const query = this.repository
      .createQueryBuilder('attachment')
      .where('attachment.id = :id', { id })
      .leftJoinAndSelect('attachment.user', 'user')

    if (!includeDeleted) {
      query.andWhere('attachment.deletedAt IS NULL')
    }

    return query.getOne()
  }

  /**
   * List all attachments with pagination and filters
   */
  async listAll(
    options: Partial<AttachmentQueryOptions> & {
      page?: number
      limit?: number
      sortBy?: string
      sortOrder?: 'ASC' | 'DESC'
    } = {}
  ): Promise<{ data: Attachment[]; total: number; page: number; limit: number }> {
    const page = options.page || 1
    const limit = options.limit || 20
    const sortBy = options.sortBy || 'createdAt'
    const sortOrder = options.sortOrder || 'DESC'

    const cacheKey = this.buildCacheKey('list', JSON.stringify(options))

    return this.withCache(
      cacheKey,
      async () => {
        const query = this.repository
          .createQueryBuilder('attachment')
          .leftJoinAndSelect('attachment.user', 'user')

        this.applyFilters(query, options)

        // Add sorting
        const validSortFields = ['createdAt', 'size', 'originalName', 'downloadCount', 'updatedAt']
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt'
        query.orderBy(`attachment.${sortField}`, sortOrder)

        // Get total count
        const total = await query.getCount()

        // Apply pagination
        query.skip((page - 1) * limit).take(limit)

        const data = await query.getMany()

        return {
          data,
          total,
          page,
          limit
        }
      },
      300
    ) // 5 minutes cache for lists
  }

  /**
   * Find all attachments by user ID
   */
  async findByUserId(
    userId: string,
    options: Partial<AttachmentQueryOptions> = {}
  ): Promise<Attachment[]> {
    const cacheKey = this.buildCacheKey('user', userId, JSON.stringify(options))

    return this.withCache(cacheKey, async () => {
      const query = this.repository
        .createQueryBuilder('attachment')
        .where('attachment.userId = :userId', { userId })
        .leftJoinAndSelect('attachment.user', 'user')

      this.applyFilters(query, options)

      return query.orderBy('attachment.createdAt', 'DESC').getMany()
    })
  }

  /**
   * Find orphaned attachments (not attached to any story)
   */
  async findOrphanedAttachments(olderThanDays = 7): Promise<Attachment[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const cacheKey = this.buildCacheKey('orphaned', olderThanDays.toString())

    return this.withCache(cacheKey, async () => {
      // Query for attachments that:
      // 1. Are older than X days
      // 2. Have no story associations
      // 3. Are not deleted
      return this.repository
        .createQueryBuilder('attachment')
        .leftJoin('story_attachments', 'sa', 'sa.attachmentId = attachment.id')
        .where('attachment.createdAt < :cutoffDate', { cutoffDate })
        .andWhere('sa.attachmentId IS NULL')
        .andWhere('attachment.deletedAt IS NULL')
        .orderBy('attachment.createdAt', 'ASC')
        .getMany()
    })
  }

  /**
   * Find attachment by checksum for duplicate detection
   */
  async findByChecksum(userId: string, checksum: string): Promise<Attachment | null> {
    const cacheKey = this.buildCacheKey('checksum', userId, checksum)

    return this.withCache(cacheKey, async () => {
      return this.repository
        .createQueryBuilder('attachment')
        .where('attachment.userId = :userId', { userId })
        .andWhere('attachment.checksum = :checksum', { checksum })
        .andWhere('attachment.deletedAt IS NULL')
        .leftJoinAndSelect('attachment.user', 'user')
        .orderBy('attachment.createdAt', 'DESC')
        .getOne()
    })
  }

  /**
   * Get attachment statistics
   */
  async getStatistics(): Promise<{
    total: number
    totalSize: number
    byCategory: Record<string, number>
    byMimeType: Record<string, number>
    bySecurityStatus: Record<string, number>
  }> {
    const cacheKey = this.buildCacheKey('stats')

    return this.withCache(
      cacheKey,
      async () => {
        const query = this.repository
          .createQueryBuilder('attachment')
          .where('attachment.deletedAt IS NULL')

        const [total, totalSizeResult, categoryStats, mimeTypeStats, securityStats] =
          await Promise.all([
            query.getCount(),
            this.repository
              .createQueryBuilder('attachment')
              .select('SUM(attachment.size)', 'totalSize')
              .where('attachment.deletedAt IS NULL')
              .getRawOne(),
            this.repository
              .createQueryBuilder('attachment')
              .select('attachment.category', 'category')
              .addSelect('COUNT(*)', 'count')
              .where('attachment.deletedAt IS NULL')
              .groupBy('attachment.category')
              .getRawMany(),
            this.repository
              .createQueryBuilder('attachment')
              .select('attachment.mimeType', 'mimeType')
              .addSelect('COUNT(*)', 'count')
              .where('attachment.deletedAt IS NULL')
              .groupBy('attachment.mimeType')
              .getRawMany(),
            this.repository
              .createQueryBuilder('attachment')
              .select('attachment.securityStatus', 'status')
              .addSelect('COUNT(*)', 'count')
              .where('attachment.deletedAt IS NULL')
              .groupBy('attachment.securityStatus')
              .getRawMany()
          ])

        return {
          total,
          totalSize: parseInt(totalSizeResult?.totalSize || '0', 10),
          byCategory: categoryStats.reduce(
            (acc, item) => {
              acc[item.category || 'uncategorized'] = parseInt(item.count, 10)
              return acc
            },
            {} as Record<string, number>
          ),
          byMimeType: mimeTypeStats.reduce(
            (acc, item) => {
              acc[item.mimeType] = parseInt(item.count, 10)
              return acc
            },
            {} as Record<string, number>
          ),
          bySecurityStatus: securityStats.reduce(
            (acc, item) => {
              acc[item.status] = parseInt(item.count, 10)
              return acc
            },
            {} as Record<string, number>
          )
        }
      },
      300
    ) // 5 minutes cache for stats
  }

  /**
   * Override create to invalidate list caches on new uploads
   */
  // ---- Direct upload lifecycle: fresh reads and compare-and-set status changes ----

  /** Uncached read, for state machines that must not act on a stale status */
  findFresh(id: string): Promise<Attachment | null> {
    return this.repository.findOneBy({ id })
  }

  /**
   * Moves the security status from `from` to `to` only if it is still `from` (a claim:
   * of two concurrent callers exactly one wins). Returns whether this call won.
   */
  async transitionSecurityStatus(id: string, from: string, to: string): Promise<boolean> {
    const result = await this.repository.update(
      { id, securityStatus: from },
      { securityStatus: to }
    )
    await this.invalidateCacheByEntityId(id)
    return (result.affected ?? 0) > 0
  }

  /** Uploads still in `status` that were created before `before` */
  findStaleByStatus(status: string, before: Date, limit: number): Promise<Attachment[]> {
    return this.repository.find({
      where: { securityStatus: status, createdAt: LessThan(before) },
      take: limit
    })
  }

  /** Deletes the row only if it is still in `status`; returns whether it did */
  async deleteIfStatus(id: string, status: string): Promise<boolean> {
    const result = await this.repository.delete({ id, securityStatus: status })
    await this.invalidateCacheByEntityId(id)
    await this.invalidateListCaches()
    return (result.affected ?? 0) > 0
  }

  /**
   * Runs work in a transaction and clears the list caches once it commits (for writes
   * that must be atomic with other rows, such as an outbox message)
   */
  async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const result = await this.repository.manager.transaction(work)
    await this.invalidateListCaches()
    await this.invalidateCacheByTag()
    return result
  }

  async create(data: Partial<Attachment>): Promise<Attachment> {
    const attachment = await super.create(data as DeepPartial<Attachment>)
    await this.invalidateListCaches()
    return attachment
  }

  /**
   * Soft delete an attachment
   */
  async softDelete(id: string): Promise<boolean> {
    const result = await this.repository.update({ id }, { deletedAt: new Date() })

    if (result.affected && result.affected > 0) {
      await this.invalidateCacheForEntity(id)
      return true
    }

    return false
  }

  /**
   * Restore a soft-deleted attachment
   */
  async restore(id: string): Promise<boolean> {
    const result = await this.repository.update({ id }, { deletedAt: null })

    if (result.affected && result.affected > 0) {
      await this.invalidateCacheForEntity(id)
      return true
    }

    return false
  }

  /**
   * Hard delete an attachment
   */
  async hardDelete(id: string): Promise<boolean> {
    const result = await this.repository.delete({ id })

    if (result.affected && result.affected > 0) {
      await this.invalidateCacheForEntity(id)
      return true
    }

    return false
  }

  /**
   * Update attachment metadata
   */
  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<Attachment | null> {
    const attachment = await this.findById(id)
    if (!attachment) {
      return null
    }

    attachment.metadata = { ...attachment.metadata, ...metadata }
    attachment.version += 1

    const updated = await this.repository.save(attachment)
    await this.invalidateCacheForEntity(id)

    return updated
  }

  /**
   * Increment download count
   */
  async incrementDownloadCount(id: string): Promise<void> {
    await this.repository.increment({ id }, 'downloadCount', 1)
    await this.repository.update({ id }, { lastAccessedAt: new Date() })
    await this.invalidateCacheForEntity(id)
  }

  /**
   * Apply common filters to a query
   */
  private applyFilters(
    query: SelectQueryBuilder<Attachment>,
    options: Partial<AttachmentQueryOptions>
  ): void {
    if (!options.includeDeleted) {
      query.andWhere('attachment.deletedAt IS NULL')
    }

    if (options.visibleToUserId) {
      query.andWhere('(attachment.userId = :viewerId OR attachment.isPublic = true)', {
        viewerId: options.visibleToUserId
      })
    }

    if (options.category) {
      query.andWhere('attachment.category = :category', { category: options.category })
    }

    if (options.mimeType) {
      query.andWhere('attachment.mimeType LIKE :mimeType', { mimeType: `${options.mimeType}%` })
    }

    if (options.isPublic !== undefined) {
      query.andWhere('attachment.isPublic = :isPublic', { isPublic: options.isPublic })
    }

    if (options.securityStatus) {
      query.andWhere('attachment.securityStatus = :securityStatus', {
        securityStatus: options.securityStatus
      })
    }

    if (options.minSize) {
      query.andWhere('attachment.size >= :minSize', { minSize: options.minSize })
    }

    if (options.maxSize) {
      query.andWhere('attachment.size <= :maxSize', { maxSize: options.maxSize })
    }

    if (options.startDate) {
      query.andWhere('attachment.createdAt >= :startDate', { startDate: options.startDate })
    }

    if (options.endDate) {
      query.andWhere('attachment.createdAt <= :endDate', { endDate: options.endDate })
    }

    if (options.tags && options.tags.length > 0) {
      query.andWhere('attachment.tags && :tags', { tags: options.tags })
    }
  }

  /**
   * Invalidate cache for a specific attachment
   */
  private async invalidateCacheForEntity(id: string): Promise<void> {
    if (!this.cacheService) return

    // Clear specific attachment cache
    await this.cacheService.del(this.buildCacheKey('id', id))
    await this.cacheService.delPattern(this.buildCacheKey('findOne', '*'))

    // Clear list caches (very important for list queries)
    await this.invalidateListCaches()
  }

  /**
   * Override invalidateListCaches to include attachment-specific patterns
   */
  protected async invalidateListCaches(): Promise<void> {
    if (!this.cacheService) {
      return
    }

    const patterns = [
      `${this.entityName}:list:*`,
      `${this.entityName}:user:*`,
      `${this.entityName}:category:*`,
      `${this.entityName}:mimetype:*`,
      `${this.entityName}:public:*`,
      `${this.entityName}:security-status:*`,
      `${this.entityName}:tags:*`,
      `${this.entityName}:stats:*`,
      `${this.entityName}:checksum:*`,
      `${this.entityName}:findOne:*`
    ]

    for (const pattern of patterns) {
      await this.cacheService.delPattern(pattern)
    }
  }
}
