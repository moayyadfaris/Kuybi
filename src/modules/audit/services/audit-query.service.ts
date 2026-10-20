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
    const logs = await this.auditLogRepository.findByUserId(userId, startDate, endDate, {
      take: limit
    })

    const actionBreakdown: Record<string, number> = {}
    let suspiciousActivityCount = 0
    let failedActionsCount = 0

    logs.forEach(log => {
      // Count actions
      actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1

      // Count suspicious activities
      if (log.action === AuditAction.SUSPICIOUS_ACTIVITY) {
        suspiciousActivityCount++
      }

      // Count failed actions
      if (log.status === AuditStatus.FAILURE) {
        failedActionsCount++
      }
    })

    const summary: UserActivitySummary = {
      userId,
      username: logs[0]?.username || null,
      email: logs[0]?.email || null,
      totalActions: logs.length,
      recentActions: logs.slice(0, 10), // Most recent 10
      actionBreakdown,
      lastActivity: logs[0]?.createdAt || null,
      suspiciousActivityCount,
      failedActionsCount
    }

    return summary
  }

  /**
   * Get complete entity history
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
    limit: number = 100
  ): Promise<EntityHistorySummary> {
    const history = await this.auditLogRepository.findEntityHistory(entityType, entityId, {
      take: limit
    })

    const modifiedByUsers = new Set<string>()
    const changeFrequency: Record<string, number> = {}

    history.forEach(log => {
      if (log.userId) {
        modifiedByUsers.add(log.userId)
      }

      changeFrequency[log.action] = (changeFrequency[log.action] || 0) + 1
    })

    // history is newest first; the creation is the oldest CREATE
    const creationLog = [...history].reverse().find(log => log.action === AuditAction.CREATE)

    const summary: EntityHistorySummary = {
      entityType,
      entityId,
      totalChanges: history.length,
      history,
      createdAt: creationLog?.createdAt || null,
      lastModifiedAt: history[0]?.createdAt || null,
      modifiedByUsers: Array.from(modifiedByUsers),
      changeFrequency
    }

    return summary
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
