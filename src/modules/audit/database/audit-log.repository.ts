import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'

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
  isArchived?: boolean
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

  async findByIpAddress(ipAddress: string, startDate?: Date, endDate?: Date): Promise<AuditLog[]> {
    const qb = this.repository
      .createQueryBuilder('log')
      .where('log.ipAddress = :ipAddress', { ipAddress })
      .orderBy('log.createdAt', 'DESC')

    if (startDate) {
      qb.andWhere('log.createdAt >= :startDate', { startDate })
    }

    if (endDate) {
      qb.andWhere('log.createdAt <= :endDate', { endDate })
    }

    return qb.getMany()
  }

  async findCriticalEvents(startDate?: Date, endDate?: Date): Promise<AuditLog[]> {
    const severities = [AuditSeverity.HIGH, AuditSeverity.CRITICAL]

    const qb = this.repository
      .createQueryBuilder('log')
      .where('log.severity IN (:...severities)', { severities })
      .orderBy('log.createdAt', 'DESC')

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

  async findByRequestId(requestId: string): Promise<AuditLog[]> {
    return this.repository
      .createQueryBuilder('log')
      .where('log.requestId = :requestId', { requestId })
      .orderBy('log.createdAt', 'DESC')
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
    byActionRaw.forEach((row: any) => {
      byAction[row.action] = Number(row.count)
    })

    const bySeverity: Record<string, number> = {}
    bySeverityRaw.forEach((row: any) => {
      bySeverity[row.severity] = Number(row.count)
    })

    const byStatus: Record<string, number> = {}
    byStatusRaw.forEach((row: any) => {
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

    if (filters.isArchived !== undefined) {
      qb.andWhere('log.isArchived = :isArchived', { isArchived: filters.isArchived })
    }

    return qb
  }
}
