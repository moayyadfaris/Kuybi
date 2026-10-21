import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { startsWithPattern } from '@shared/utils/like.util'
import { EntityManager, LessThan, Repository, SelectQueryBuilder } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { Attachment } from '../entities/attachment.entity'

export interface AttachmentListOptions {
  /** Only this user's files */
  userId?: string
  /** Only files this user owns or that are public */
  visibleToUserId?: string
  category?: string
  /** Prefix, e.g. "image/" */
  mimeType?: string
  isPublic?: boolean
  securityStatus?: string
  minSize?: number
  maxSize?: number
  startDate?: Date
  endDate?: Date
  includeDeleted?: boolean
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

const SORT_FIELDS = ['createdAt', 'size', 'originalName', 'downloadCount', 'updatedAt']

/**
 * Attachment rows, cached per the cache contract. Rows are loaded without the uploader's
 * account; responses go through AttachmentPresenter. `findById` (BaseRepository) also
 * returns soft-deleted rows: reads on behalf of users use findLive.
 */
@Injectable()
export class AttachmentRepository extends BaseRepository<Attachment> {
  protected entityName = 'attachment'
  protected defaultTTL = 600

  constructor(
    @InjectRepository(Attachment)
    repository: Repository<Attachment>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /** The attachment unless it is missing or soft-deleted */
  async findLive(id: string): Promise<Attachment | null> {
    const attachment = await this.findById(id)
    return attachment && !attachment.deletedAt ? attachment : null
  }

  /** Filtered, sorted and paginated, with the total count */
  async listAll(
    options: AttachmentListOptions = {}
  ): Promise<{ data: Attachment[]; total: number; page: number; limit: number }> {
    const page = options.page || 1
    const limit = options.limit || 20
    const sortField = SORT_FIELDS.includes(options.sortBy ?? '') ? options.sortBy : 'createdAt'
    const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC'

    return this.cached(
      this.buildCacheKey('list', JSON.stringify(options)),
      async () => {
        const query = this.repository.createQueryBuilder('attachment')
        this.applyFilters(query, options)
        query.orderBy(`attachment.${sortField}`, sortOrder)

        const total = await query.getCount()
        const data = await query
          .skip((page - 1) * limit)
          .take(limit)
          .getMany()
        return { data, total, page, limit }
      },
      300
    )
  }

  /** The user's newest live upload with this content (duplicate detection) */
  async findByChecksum(userId: string, checksum: string): Promise<Attachment | null> {
    // The newest match, not a unique key: a selection
    return this.cached(
      this.buildCacheKey('checksum', userId, checksum),
      () =>
        this.repository
          .createQueryBuilder('attachment')
          .where('attachment.userId = :userId', { userId })
          .andWhere('attachment.checksum = :checksum', { checksum })
          .andWhere('attachment.deletedAt IS NULL')
          .orderBy('attachment.createdAt', 'DESC')
          .getOne(),
      undefined,
      { selection: true }
    )
  }

  /** Counts and total size of live attachments, cached for 5 minutes */
  async getStatistics(): Promise<{
    total: number
    totalSize: number
    byCategory: Record<string, number>
    byMimeType: Record<string, number>
    bySecurityStatus: Record<string, number>
  }> {
    return this.cached(
      this.buildCacheKey('stats'),
      async () => {
        const live = () =>
          this.repository.createQueryBuilder('attachment').where('attachment.deletedAt IS NULL')
        const countBy = async (column: string) => {
          const rows = await live()
            .select(`attachment.${column}`, 'value')
            .addSelect('COUNT(*)', 'count')
            .groupBy(`attachment.${column}`)
            .getRawMany<{ value: string | null; count: string }>()
          return Object.fromEntries(
            rows.map(row => [row.value ?? 'uncategorized', Number(row.count)])
          )
        }

        const [totals, byCategory, byMimeType, bySecurityStatus] = await Promise.all([
          live()
            .select('COUNT(*)', 'total')
            .addSelect('COALESCE(SUM(attachment.size), 0)', 'totalSize')
            .getRawOne<{ total: string; totalSize: string }>(),
          countBy('category'),
          countBy('mimeType'),
          countBy('securityStatus')
        ])

        return {
          total: Number(totals?.total ?? 0),
          totalSize: Number(totals?.totalSize ?? 0),
          byCategory,
          byMimeType,
          bySecurityStatus
        }
      },
      300
    )
  }

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
    return (result.affected ?? 0) > 0
  }

  /** Soft delete (deletedAt is a plain column here, not a @DeleteDateColumn) */
  /**
   * Runs `work` holding the row lock (SELECT ... FOR UPDATE) of an attachment, deleted or
   * not, in a transaction: whoever changes visibility or deletion waits for whoever is
   * applying it to the stored objects. `work` gets the row as it is now (null if gone)
   * and writes through `manager`; the cached row is dropped after the commit.
   */
  withLockedRow<R>(
    id: string,
    work: (row: Attachment | null, manager: EntityManager) => Promise<R>
  ): Promise<R> {
    return this.transaction(
      async manager => {
        const row = await manager
          .getRepository(Attachment)
          .createQueryBuilder('attachment')
          .setLock('pessimistic_write')
          .where('attachment.id = :id', { id })
          .getOne()
        return work(row, manager)
      },
      { touched: [id] }
    )
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.repository.update({ id }, { deletedAt: new Date() })
    await this.invalidateCacheByEntityId(id)
    return (result.affected ?? 0) > 0
  }

  async restore(id: string): Promise<boolean> {
    const result = await this.repository.update({ id }, { deletedAt: null })
    await this.invalidateCacheByEntityId(id)
    return (result.affected ?? 0) > 0
  }

  /** Counts a download (or presigned URL) and records when the file was last accessed */
  async recordAccess(id: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(Attachment)
      .set({ downloadCount: () => '"downloadCount" + 1', lastAccessedAt: new Date() })
      .where('id = :id', { id })
      .execute()
    await this.invalidateCacheByEntityId(id)
  }

  private applyFilters(
    query: SelectQueryBuilder<Attachment>,
    options: AttachmentListOptions
  ): void {
    if (!options.includeDeleted) {
      query.andWhere('attachment.deletedAt IS NULL')
    }
    if (options.userId) {
      query.andWhere('attachment.userId = :userId', { userId: options.userId })
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
      query.andWhere('attachment.mimeType LIKE :mimeType', {
        mimeType: startsWithPattern(options.mimeType)
      })
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
  }
}
