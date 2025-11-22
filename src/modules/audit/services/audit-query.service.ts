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
    this.logger.info({ userId, startDate, endDate, limit }, 'Fetching user activity')

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

    this.logger.info({ userId, totalActions: summary.totalActions }, 'User activity fetched')

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
    this.logger.info({ entityType, entityId, limit }, 'Fetching entity history')

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

    // Find creation event
    const creationLog = history.reverse().find(log => log.action === AuditAction.CREATE)

    const summary: EntityHistorySummary = {
      entityType,
      entityId,
      totalChanges: history.length,
      history: history.reverse(), // Most recent first
      createdAt: creationLog?.createdAt || null,
      lastModifiedAt: history[0]?.createdAt || null,
      modifiedByUsers: Array.from(modifiedByUsers),
      changeFrequency
    }

    this.logger.info(
      { entityType, entityId, totalChanges: summary.totalChanges },
      'Entity history fetched'
    )

    return summary
  }

  /**
   * Advanced search with pagination and filtering
   */
  async searchAuditLogs(
    filters: AuditLogFilters,
    pagination: PaginationQueryDto
  ): Promise<AuditLogSearchResult> {
    this.logger.info({ filters, pagination }, 'Searching audit logs')

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

    this.logger.info({ total, page, totalPages }, 'Audit logs search completed')

    return result
  }

  /**
   * Get audit log statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date) {
    this.logger.info({ startDate, endDate }, 'Fetching audit statistics')

    const stats = await this.auditLogRepository.getStatistics(startDate, endDate)

    this.logger.info({ total: stats.total }, 'Audit statistics fetched')

    return stats
  }

  /**
   * Get critical/high-severity events for security monitoring
   */
  async getCriticalEvents(startDate?: Date, endDate?: Date): Promise<AuditLog[]> {
    this.logger.info({ startDate, endDate }, 'Fetching critical events')

    const events = await this.auditLogRepository.findCriticalEvents(startDate, endDate)

    this.logger.warn({ count: events.length }, 'Critical security events fetched')

    return events
  }

  /**
   * Get failed operations for troubleshooting
   */
  async getFailedOperations(
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<AuditLog[]> {
    this.logger.info({ startDate, endDate, limit }, 'Fetching failed operations')

    const failed = await this.auditLogRepository.findFailedOperations(startDate, endDate, {
      take: limit
    })

    this.logger.info({ count: failed.length }, 'Failed operations fetched')

    return failed
  }

  /**
   * Get logs by specific action type(s)
   */
  async getByAction(action: AuditAction | AuditAction[], limit: number = 100): Promise<AuditLog[]> {
    const actions = Array.isArray(action) ? action : [action]
    this.logger.info({ actions, limit }, 'Fetching logs by action')

    const logs = await this.auditLogRepository.findByAction(action, { take: limit })

    this.logger.info({ count: logs.length }, 'Logs by action fetched')

    return logs
  }

  /**
   * Get logs by IP address for security analysis
   */
  async getByIpAddress(ipAddress: string, startDate?: Date, endDate?: Date): Promise<AuditLog[]> {
    this.logger.info({ ipAddress, startDate, endDate }, 'Fetching logs by IP')

    const logs = await this.auditLogRepository.findByIpAddress(ipAddress, startDate, endDate)

    this.logger.info({ ipAddress, count: logs.length }, 'Logs by IP fetched')

    return logs
  }

  /**
   * Get logs by request ID for distributed tracing
   */
  async getByRequestId(requestId: string): Promise<AuditLog[]> {
    this.logger.info({ requestId }, 'Fetching logs by request ID')

    const logs = await this.auditLogRepository.findByRequestId(requestId)

    this.logger.info({ requestId, count: logs.length }, 'Logs by request ID fetched')

    return logs
  }

  /**
   * Get single audit log by ID
   */
  async getById(id: string): Promise<AuditLog | null> {
    this.logger.info({ id }, 'Fetching audit log by ID')

    const log = await this.auditLogRepository.findById(id)

    if (!log) {
      this.logger.warn({ id }, 'Audit log not found')
    }

    return log
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

    const logs = await this.auditLogRepository.findByUserId(userId, startDate)

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
