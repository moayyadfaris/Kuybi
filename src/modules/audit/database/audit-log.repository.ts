import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, Repository, SelectQueryBuilder } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { AuditAction, AuditLog, AuditSeverity, AuditStatus } from '../entities/audit-log.entity'

export interface AuditLogFilters {
  userId?: string
  action?: AuditAction | AuditAction[]
  entityType?: string
  entityId?: string
  ipAddress?: string
  severity?: AuditSeverity | AuditSeverity[]
  status?: AuditStatus | AuditStatus[]
  startDate?: Date
  endDate?: Date
  tags?: string[]
}

export interface AuditLogStatistics {
  total: number
  byAction: Record<string, number>
  bySeverity: Record<string, number>
  byStatus: Record<string, number>
  successRate: number
  criticalCount: number
  failedCount: number
}

/**
 * The audit trail: append-only rows and read-only queries for the super-admin API. Every
 * list query takes a cap. Rows are never updated; the retention job deletes expired ones
 * (deleteExpired).
 */
/** Distinct users an entity summary lists at most */
const MAX_SUMMARY_USERS = 100

@Injectable()
export class AuditLogRepository extends BaseRepository<AuditLog> {
  protected entityName = 'audit_log'
  protected defaultTTL = 300

  constructor(
    @InjectRepository(AuditLog)
    repository: Repository<AuditLog>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Inserts a log row. Audit logs are append-only and only findById is cached, so a new
   * row cannot make any cached read stale: no invalidation (this runs on every audited
   * request).
   */
  async append(data: DeepPartial<AuditLog>): Promise<AuditLog> {
    return this.repository.save(this.repository.create(data))
  }

  /**
   * Deletes up to `batch` rows created before their cutoff: `criticalBefore` for critical
   * rows, `before` for the others (null keeps them). Returns how many were deleted.
   */
  async deleteExpired(
    before: Date | null,
    criticalBefore: Date | null,
    batch: number
  ): Promise<number> {
    if (!before && !criticalBefore) return 0
    const [, deleted] = await this.repository.query(
      `DELETE FROM audit_logs WHERE id IN (
         SELECT id FROM audit_logs
         WHERE (severity <> 'critical' AND "createdAt" < $1)
            OR (severity = 'critical' AND "createdAt" < $2)
         LIMIT $3
       )`,
      [before, criticalBefore, batch]
    )
    // findById is cached; a deleted row must not be served from it
    if (deleted > 0) await this.invalidateCacheByTag()
    return deleted
  }

  async findByUserId(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    options?: { skip?: number; take?: number }
  ): Promise<AuditLog[]> {
    const qb = this.repository
      .createQueryBuilder('log')
      .where('log.userId = :userId', { userId })
      .orderBy('log.createdAt', 'DESC')

    if (startDate) {
      qb.andWhere('log.createdAt >= :startDate', { startDate })
    }

    if (endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate })
    }

    if (options?.skip !== undefined) {
      qb.skip(options.skip)
    }

    if (options?.take !== undefined) {
      qb.take(options.take)
    }

    return qb.getMany()
  }

  /**
   * Totals of a user's actions in the period, by action, with the failed and
   * suspicious-activity counts (SQL aggregates: summaries count every row, not a page)
   */
  async summarizeUser(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ byAction: Record<string, number>; failed: number; lastActivity: Date | null }> {
    const qb = this.repository
      .createQueryBuilder('log')
      .select('log.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .addSelect(`COUNT(*) FILTER (WHERE log.status = :failure)`, 'failed')
      .addSelect('MAX(log.createdAt)', 'last')
      .where('log.userId = :userId', { userId, failure: AuditStatus.FAILURE })
      .groupBy('log.action')
    if (startDate) qb.andWhere('log.createdAt >= :startDate', { startDate })
    if (endDate) qb.andWhere('log.createdAt <= :endDate', { endDate })
    const rows: Array<{ action: string; count: string; failed: string; last: Date }> =
      await qb.getRawMany()
    return {
      byAction: Object.fromEntries(rows.map(row => [row.action, Number(row.count)])),
      failed: rows.reduce((sum, row) => sum + Number(row.failed), 0),
      lastActivity: rows.reduce<Date | null>(
        (latest, row) => (!latest || new Date(row.last) > latest ? new Date(row.last) : latest),
        null
      )
    }
  }

  /** Totals of an entity's history: by action, first creation, last change, distinct users */
  async summarizeEntity(
    entityType: string,
    entityId: string
  ): Promise<{
    byAction: Record<string, number>
    createdAt: Date | null
    lastModifiedAt: Date | null
    userIds: string[]
  }> {
    const where = 'log.entityType = :entityType AND log.entityId = :entityId'
    const rows: Array<{ action: string; count: string; first: Date; last: Date }> =
      await this.repository
        .createQueryBuilder('log')
        .select('log.action', 'action')
        .addSelect('COUNT(*)', 'count')
        .addSelect('MIN(log.createdAt)', 'first')
        .addSelect('MAX(log.createdAt)', 'last')
        .where(where, { entityType, entityId })
        .groupBy('log.action')
        .getRawMany()
    const users: Array<{ userId: string }> = await this.repository
      .createQueryBuilder('log')
      .select('DISTINCT log.userId', 'userId')
      .where(where, { entityType, entityId })
      .andWhere('log.userId IS NOT NULL')
      .limit(MAX_SUMMARY_USERS)
      .getRawMany()
    const created = rows.find(row => row.action === AuditAction.CREATE)
    const last = rows.map(row => new Date(row.last)).sort((a, b) => b.getTime() - a.getTime())[0]
    return {
      byAction: Object.fromEntries(rows.map(row => [row.action, Number(row.count)])),
      createdAt: created ? new Date(created.first) : null,
      lastModifiedAt: last ?? null,
      userIds: users.map(user => user.userId)
    }
  }

  async findEntityHistory(
    entityType: string,
    entityId: string,
    options?: { skip?: number; take?: number }
  ): Promise<AuditLog[]> {
    const qb = this.repository
      .createQueryBuilder('log')
      .where('log.entityType = :entityType', { entityType })
      .andWhere('log.entityId = :entityId', { entityId })
      .orderBy('log.createdAt', 'DESC')

    if (options?.skip !== undefined) {
      qb.skip(options.skip)
    }

    if (options?.take !== undefined) {
      qb.take(options.take)
    }

    return qb.getMany()
  }

  async findByAction(
    action: AuditAction | AuditAction[],
    options?: { skip?: number; take?: number }
  ): Promise<AuditLog[]> {
    const actions = Array.isArray(action) ? action : [action]

    const qb = this.repository
      .createQueryBuilder('log')
      .where('log.action IN (:...actions)', { actions })
      .orderBy('log.createdAt', 'DESC')

    if (options?.skip !== undefined) {
      qb.skip(options.skip)
    }

    if (options?.take !== undefined) {
      qb.take(options.take)
    }

    return qb.getMany()
  }

  async findByIpAddress(
    ipAddress: string,
    startDate: Date | undefined,
    endDate: Date | undefined,
    take: number
  ): Promise<AuditLog[]> {
    const qb = this.repository
      .createQueryBuilder('log')
      .where('log.ipAddress = :ipAddress', { ipAddress })
      .orderBy('log.createdAt', 'DESC')
      .take(take)

    if (startDate) {
      qb.andWhere('log.createdAt >= :startDate', { startDate })
    }

    if (endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate })
    }

    return qb.getMany()
  }

  async findCriticalEvents(
    startDate: Date | undefined,
    endDate: Date | undefined,
    take: number
  ): Promise<AuditLog[]> {
    const severities = [AuditSeverity.HIGH, AuditSeverity.CRITICAL]

    const qb = this.repository
      .createQueryBuilder('log')
      .where('log.severity IN (:...severities)', { severities })
      .orderBy('log.createdAt', 'DESC')
      .take(take)

    if (startDate) {
      qb.andWhere('log.createdAt >= :startDate', { startDate })
    }

    if (endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate })
    }

    return qb.getMany()
  }

  async findFailedOperations(
    startDate?: Date,
    endDate?: Date,
    options?: { skip?: number; take?: number }
  ): Promise<AuditLog[]> {
    const qb = this.repository
      .createQueryBuilder('log')
      .where('log.status = :status', { status: AuditStatus.FAILURE })
      .orderBy('log.createdAt', 'DESC')

    if (startDate) {
      qb.andWhere('log.createdAt >= :startDate', { startDate })
    }

    if (endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate })
    }

    if (options?.skip !== undefined) {
      qb.skip(options.skip)
    }

    if (options?.take !== undefined) {
      qb.take(options.take)
    }

    return qb.getMany()
  }

  async findByRequestId(requestId: string, take: number): Promise<AuditLog[]> {
    return this.repository
      .createQueryBuilder('log')
      .where('log.requestId = :requestId', { requestId })
      .orderBy('log.createdAt', 'DESC')
      .take(take)
      .getMany()
  }

  async search(
    filters: AuditLogFilters,
    options: { skip?: number; take?: number }
  ): Promise<[AuditLog[], number]> {
    const qb = this.applyFilters(this.repository.createQueryBuilder('log'), filters).orderBy(
      'log.createdAt',
      'DESC'
    )

    if (options.skip !== undefined) {
      qb.skip(options.skip)
    }

    if (options.take !== undefined) {
      qb.take(options.take)
    }

    return qb.getManyAndCount()
  }

  async getStatistics(startDate?: Date, endDate?: Date): Promise<AuditLogStatistics> {
    const qb = this.repository.createQueryBuilder('log')

    if (startDate) {
      qb.andWhere('log.createdAt >= :startDate', { startDate })
    }

    if (endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate })
    }

    const [total, byActionRaw, bySeverityRaw, byStatusRaw, criticalCount, failedCount] =
      await Promise.all([
        qb.getCount(),
        qb
          .clone()
          .select('log.action', 'action')
          .addSelect('COUNT(*)', 'count')
          .groupBy('log.action')
          .getRawMany(),
        qb
          .clone()
          .select('log.severity', 'severity')
          .addSelect('COUNT(*)', 'count')
          .groupBy('log.severity')
          .getRawMany(),
        qb
          .clone()
          .select('log.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('log.status')
          .getRawMany(),
        qb
          .clone()
          .andWhere('log.severity IN (:...critical)', {
            critical: [AuditSeverity.HIGH, AuditSeverity.CRITICAL]
          })
          .getCount(),
        qb.clone().andWhere('log.status = :failure', { failure: AuditStatus.FAILURE }).getCount()
      ])

    const byAction: Record<string, number> = {}
    byActionRaw.forEach((row: { action: string; count: string }) => {
      byAction[row.action] = Number(row.count)
    })

    const bySeverity: Record<string, number> = {}
    bySeverityRaw.forEach((row: { severity: string; count: string }) => {
      bySeverity[row.severity] = Number(row.count)
    })

    const byStatus: Record<string, number> = {}
    byStatusRaw.forEach((row: { status: string; count: string }) => {
      byStatus[row.status] = Number(row.count)
    })

    const successCount = total - failedCount
    const successRate = total === 0 ? 0 : Number(((successCount / total) * 100).toFixed(2))

    return {
      total,
      byAction,
      bySeverity,
      byStatus,
      successRate,
      criticalCount,
      failedCount
    }
  }

  private applyFilters(
    qb: SelectQueryBuilder<AuditLog>,
    filters: AuditLogFilters
  ): SelectQueryBuilder<AuditLog> {
    if (filters.userId) {
      qb.andWhere('log.userId = :userId', { userId: filters.userId })
    }

    if (filters.action) {
      const actions = Array.isArray(filters.action) ? filters.action : [filters.action]
      qb.andWhere('log.action IN (:...actions)', { actions })
    }

    if (filters.entityType) {
      qb.andWhere('log.entityType = :entityType', { entityType: filters.entityType })
    }

    if (filters.entityId) {
      qb.andWhere('log.entityId = :entityId', { entityId: filters.entityId })
    }

    if (filters.ipAddress) {
      qb.andWhere('log.ipAddress = :ipAddress', { ipAddress: filters.ipAddress })
    }

    if (filters.severity) {
      const severities = Array.isArray(filters.severity) ? filters.severity : [filters.severity]
      qb.andWhere('log.severity IN (:...severities)', { severities })
    }

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
      qb.andWhere('log.status IN (:...statuses)', { statuses })
    }

    if (filters.startDate) {
      qb.andWhere('log.createdAt >= :startDate', { startDate: filters.startDate })
    }

    if (filters.endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate: filters.endDate })
    }

    if (filters.tags && filters.tags.length > 0) {
      qb.andWhere('log.tags @> :tags', { tags: JSON.stringify(filters.tags) })
    }

    return qb
  }
}
