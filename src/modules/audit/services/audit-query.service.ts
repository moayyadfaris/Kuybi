import { Injectable } from '@nestjs/common'
import { PaginationQueryDto } from '@shared/dto/pagination-query.dto'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AuditLogFilters, AuditLogRepository } from '../database/audit-log.repository'
import { AuditAction, AuditLog, AuditStatus } from '../entities/audit-log.entity'

export interface AuditLogSearchResult {
  logs: AuditLog[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

export interface UserActivitySummary {
  userId: string
  username: string | null
  email: string | null
  totalActions: number
  recentActions: AuditLog[]
  actionBreakdown: Record<string, number>
  lastActivity: Date | null
  suspiciousActivityCount: number
  failedActionsCount: number
}

export interface EntityHistorySummary {
  entityType: string
  entityId: string
  totalChanges: number
  history: AuditLog[]
  createdAt: Date | null
  lastModifiedAt: Date | null
  modifiedByUsers: string[]
  changeFrequency: Record<string, number>
}

/** Recent actions listed with a user's activity summary at most */
const RECENT_ACTIONS = 10

/** Rows read to look for suspicious patterns in a user's recent activity */
const SUSPICIOUS_SCAN_LIMIT = 1000

/** Read side of the audit trail for the super-admin API: searches, summaries, lookups */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly auditLogRepository: AuditLogRepository,
    @InjectPinoLogger(AuditQueryService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Get user activity with summary statistics
   */
  async getUserActivity(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 50
  ): Promise<UserActivitySummary> {
    // Totals over every row of the period; the recent actions are a page of them
    const [summary, recent] = await Promise.all([
      this.auditLogRepository.summarizeUser(userId, startDate, endDate),
      this.auditLogRepository.findByUserId(userId, startDate, endDate, {
        take: Math.min(limit, RECENT_ACTIONS)
      })
    ])
    return {
      userId,
      username: recent[0]?.username || null,
      email: recent[0]?.email || null,
      totalActions: Object.values(summary.byAction).reduce((sum, count) => sum + count, 0),
      recentActions: recent,
      actionBreakdown: summary.byAction,
      lastActivity: summary.lastActivity,
      suspiciousActivityCount: summary.byAction[AuditAction.SUSPICIOUS_ACTIVITY] ?? 0,
      failedActionsCount: summary.failed
    }
  }

  /**
   * An entity's history: its totals over every row, and the latest `limit` entries
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
    limit: number = 100
  ): Promise<EntityHistorySummary> {
    const [summary, history] = await Promise.all([
      this.auditLogRepository.summarizeEntity(entityType, entityId),
      this.auditLogRepository.findEntityHistory(entityType, entityId, { take: limit })
    ])
    return {
      entityType,
      entityId,
      totalChanges: Object.values(summary.byAction).reduce((sum, count) => sum + count, 0),
      history,
      createdAt: summary.createdAt,
      lastModifiedAt: summary.lastModifiedAt,
      modifiedByUsers: summary.userIds,
      changeFrequency: summary.byAction
    }
  }

  /**
   * Advanced search with pagination and filtering
   */
  async searchAuditLogs(
    filters: AuditLogFilters,
    pagination: PaginationQueryDto
  ): Promise<AuditLogSearchResult> {
    const { page = 1, limit = 50 } = pagination
    const skip = (page - 1) * limit

    const [logs, total] = await this.auditLogRepository.search(filters, {
      skip,
      take: limit
    })

    const totalPages = Math.ceil(total / limit)

    const result: AuditLogSearchResult = {
      logs,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1
    }

    return result
  }

  /**
   * Get audit log statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date) {
    return this.auditLogRepository.getStatistics(startDate, endDate)
  }

  /**
   * Get critical/high-severity events for security monitoring
   */
  async getCriticalEvents(startDate?: Date, endDate?: Date, limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.findCriticalEvents(startDate, endDate, limit)
  }

  /**
   * Get failed operations for troubleshooting
   */
  async getFailedOperations(
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.findFailedOperations(startDate, endDate, { take: limit })
  }

  /**
   * Get logs by specific action type(s)
   */
  getByAction(action: AuditAction | AuditAction[], limit: number = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.findByAction(action, { take: limit })
  }

  /**
   * Get logs by IP address for security analysis
   */
  async getByIpAddress(
    ipAddress: string,
    startDate?: Date,
    endDate?: Date,
    limit = 100
  ): Promise<AuditLog[]> {
    return this.auditLogRepository.findByIpAddress(ipAddress, startDate, endDate, limit)
  }

  /**
   * Get logs by request ID for distributed tracing
   */
  async getByRequestId(requestId: string, limit = 100): Promise<AuditLog[]> {
    return this.auditLogRepository.findByRequestId(requestId, limit)
  }

  /**
   * Get single audit log by ID
   */
  async getById(id: string): Promise<AuditLog | null> {
    return this.auditLogRepository.findById(id)
  }

  /**
   * Detect suspicious patterns in audit logs
   */
  async detectSuspiciousActivity(
    userId: string,
    timeWindowMinutes: number = 60
  ): Promise<{
    isSuspicious: boolean
    reasons: string[]
    recentLogs: AuditLog[]
  }> {
    const startDate = new Date(Date.now() - timeWindowMinutes * 60 * 1000)

    // Enough rows for every rule below (the busiest one flags more than 100)
    const logs = await this.auditLogRepository.findByUserId(userId, startDate, undefined, {
      take: SUSPICIOUS_SCAN_LIMIT
    })

    const reasons: string[] = []
    let isSuspicious = false

    // Check for high frequency of failed logins
    const failedLogins = logs.filter(
      log => log.action === AuditAction.LOGIN && log.status === AuditStatus.FAILURE
    )
    if (failedLogins.length >= 5) {
      reasons.push(`${failedLogins.length} failed login attempts in ${timeWindowMinutes} minutes`)
      isSuspicious = true
    }

    // Check for unusual number of actions
    if (logs.length > 100) {
      reasons.push(
        `Unusually high activity: ${logs.length} actions in ${timeWindowMinutes} minutes`
      )
      isSuspicious = true
    }

    // Check for multiple IPs
    const uniqueIps = new Set(logs.map(log => log.ipAddress).filter(Boolean))
    if (uniqueIps.size > 3) {
      reasons.push(`Activity from ${uniqueIps.size} different IP addresses`)
      isSuspicious = true
    }

    // Check for unauthorized access attempts
    const unauthorizedAttempts = logs.filter(log => log.action === AuditAction.UNAUTHORIZED_ACCESS)
    if (unauthorizedAttempts.length > 0) {
      reasons.push(`${unauthorizedAttempts.length} unauthorized access attempts`)
      isSuspicious = true
    }

    if (isSuspicious) {
      this.logger.warn({ userId, reasons, logCount: logs.length }, 'Suspicious activity detected')
    }

    return {
      isSuspicious,
      reasons,
      recentLogs: logs.slice(0, 20)
    }
  }
}
