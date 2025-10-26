import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from './base.repository'
import { CacheService } from '../../cache/services/cache.service'
import { Attachment } from '../../attachments/entities/attachment.entity'

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
      return this.cacheService.wrap(cacheKey, factory, ttl || this.defaultTTL)
    }
    return factory()
  }

  /**
   * Find attachment by ID with optional soft delete inclusion
   */
  async findByIdWithOptions(id: string, includeDeleted = false): Promise<Attachment | null> {
    const cacheKey = this.buildCacheKey('id', id.toString(), includeDeleted ? 'with-deleted' : 'active')
    
    if (!includeDeleted) {
      // Use base findById for normal queries
      return this.findById(id)
    }

    // For queries including deleted records
    const query = this.repository.createQueryBuilder('attachment')
      .where('attachment.id = :id', { id })
      .leftJoinAndSelect('attachment.user', 'user')

    if (!includeDeleted) {
      query.andWhere('attachment.deletedAt IS NULL')
    }

    return query.getOne()
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
      const query = this.repository.createQueryBuilder('attachment')
        .where('attachment.userId = :userId', { userId })
        .leftJoinAndSelect('attachment.user', 'user')

      this.applyFilters(query, options)

      return query
        .orderBy('attachment.createdAt', 'DESC')
        .getMany()
    })
  }

  /**
   * Find attachments by category
   */
  async findByCategory(
    category: string, 
    options: Partial<AttachmentQueryOptions> = {}
  ): Promise<Attachment[]> {
    const cacheKey = this.buildCacheKey('category', category, JSON.stringify(options))
    
    return this.withCache(cacheKey, async () => {
      const query = this.repository.createQueryBuilder('attachment')
        .where('attachment.category = :category', { category })
        .leftJoinAndSelect('attachment.user', 'user')

      this.applyFilters(query, options)

      return query
        .orderBy('attachment.createdAt', 'DESC')
        .getMany()
    })
  }

  /**
   * Find attachments by MIME type pattern
   */
  async findByMimeType(
    mimeTypePattern: string, 
    options: Partial<AttachmentQueryOptions> = {}
  ): Promise<Attachment[]> {
    const cacheKey = this.buildCacheKey('mimetype', mimeTypePattern, JSON.stringify(options))
    
    return this.withCache(cacheKey, async () => {
      const query = this.repository.createQueryBuilder('attachment')
        .where('attachment.mimeType LIKE :pattern', { pattern: `${mimeTypePattern}%` })
        .leftJoinAndSelect('attachment.user', 'user')

      this.applyFilters(query, options)

      return query
        .orderBy('attachment.createdAt', 'DESC')
        .getMany()
    })
  }

  /**
   * Find public attachments
   */
  async findPublicAttachments(
    options: Partial<AttachmentQueryOptions> = {}
  ): Promise<Attachment[]> {
    const cacheKey = this.buildCacheKey('public', JSON.stringify(options))
    
    return this.withCache(cacheKey, async () => {
      const query = this.repository.createQueryBuilder('attachment')
        .where('attachment.isPublic = :isPublic', { isPublic: true })
        .leftJoinAndSelect('attachment.user', 'user')

      this.applyFilters(query, options)

      return query
        .orderBy('attachment.createdAt', 'DESC')
        .getMany()
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
      return this.repository.createQueryBuilder('attachment')
        .leftJoin('story_attachments', 'sa', 'sa.attachmentId = attachment.id')
        .where('attachment.createdAt < :cutoffDate', { cutoffDate })
        .andWhere('sa.attachmentId IS NULL')
        .andWhere('attachment.deletedAt IS NULL')
        .orderBy('attachment.createdAt', 'ASC')
        .getMany()
    })
  }

  /**
   * Find attachments by security status
   */
  async findBySecurityStatus(
    status: string,
    options: Partial<AttachmentQueryOptions> = {}
  ): Promise<Attachment[]> {
    const cacheKey = this.buildCacheKey('security-status', status, JSON.stringify(options))
    
    return this.withCache(cacheKey, async () => {
      const query = this.repository.createQueryBuilder('attachment')
        .where('attachment.securityStatus = :status', { status })
        .leftJoinAndSelect('attachment.user', 'user')

      this.applyFilters(query, options)

      return query
        .orderBy('attachment.createdAt', 'DESC')
        .getMany()
    })
  }

  /**
   * Find attachments by tags
   */
  async findByTags(tags: string[]): Promise<Attachment[]> {
    if (!tags || tags.length === 0) {
      return []
    }

    const cacheKey = this.buildCacheKey('tags', tags.join(','))
    
    return this.withCache(cacheKey, async () => {
      return this.repository.createQueryBuilder('attachment')
        .where('attachment.tags && :tags', { tags })
        .andWhere('attachment.deletedAt IS NULL')
        .leftJoinAndSelect('attachment.user', 'user')
        .orderBy('attachment.createdAt', 'DESC')
        .getMany()
    })
  }

  /**
   * Find attachments expiring soon
   */
  async findExpiringAttachments(withinDays = 7): Promise<Attachment[]> {
    const now = new Date()
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + withinDays)

    const cacheKey = this.buildCacheKey('expiring', withinDays.toString())
    
    return this.withCache(cacheKey, async () => {
      return this.repository.createQueryBuilder('attachment')
        .where('attachment.expiresAt IS NOT NULL')
        .andWhere('attachment.expiresAt BETWEEN :now AND :futureDate', { now, futureDate })
        .andWhere('attachment.deletedAt IS NULL')
        .leftJoinAndSelect('attachment.user', 'user')
        .orderBy('attachment.expiresAt', 'ASC')
        .getMany()
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
    
    return this.withCache(cacheKey, async () => {
      const query = this.repository.createQueryBuilder('attachment')
        .where('attachment.deletedAt IS NULL')

      const [total, totalSizeResult, categoryStats, mimeTypeStats, securityStats] = await Promise.all([
        query.getCount(),
        this.repository.createQueryBuilder('attachment')
          .select('SUM(attachment.size)', 'totalSize')
          .where('attachment.deletedAt IS NULL')
          .getRawOne(),
        this.repository.createQueryBuilder('attachment')
          .select('attachment.category', 'category')
          .addSelect('COUNT(*)', 'count')
          .where('attachment.deletedAt IS NULL')
          .groupBy('attachment.category')
          .getRawMany(),
        this.repository.createQueryBuilder('attachment')
          .select('attachment.mimeType', 'mimeType')
          .addSelect('COUNT(*)', 'count')
          .where('attachment.deletedAt IS NULL')
          .groupBy('attachment.mimeType')
          .getRawMany(),
        this.repository.createQueryBuilder('attachment')
          .select('attachment.securityStatus', 'status')
          .addSelect('COUNT(*)', 'count')
          .where('attachment.deletedAt IS NULL')
          .groupBy('attachment.securityStatus')
          .getRawMany()
      ])

      return {
        total,
        totalSize: parseInt(totalSizeResult?.totalSize || '0', 10),
        byCategory: categoryStats.reduce((acc, item) => {
          acc[item.category || 'uncategorized'] = parseInt(item.count, 10)
          return acc
        }, {} as Record<string, number>),
        byMimeType: mimeTypeStats.reduce((acc, item) => {
          acc[item.mimeType] = parseInt(item.count, 10)
          return acc
        }, {} as Record<string, number>),
        bySecurityStatus: securityStats.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count, 10)
          return acc
        }, {} as Record<string, number>)
      }
    }, 300) // 5 minutes cache for stats
  }

  /**
   * Soft delete an attachment
   */
  async softDelete(id: string): Promise<boolean> {
    const result = await this.repository.update(
      { id },
      { deletedAt: new Date() }
    )

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
    const result = await this.repository.update(
      { id },
      { deletedAt: null }
    )

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
  async updateMetadata(
    id: string, 
    metadata: Record<string, unknown>
  ): Promise<Attachment | null> {
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
  private applyFilters(query: any, options: Partial<AttachmentQueryOptions>): void {
    if (!options.includeDeleted) {
      query.andWhere('attachment.deletedAt IS NULL')
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
      query.andWhere('attachment.securityStatus = :securityStatus', { securityStatus: options.securityStatus })
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
    // Clear all cache entries related to this attachment
    const patterns = [
      this.buildCacheKey('id', id.toString(), '*'),
      this.buildCacheKey('*') // Clear all attachment caches to be safe
    ]

    for (const pattern of patterns) {
      await this.cacheService.del(pattern)
    }
  }
}
