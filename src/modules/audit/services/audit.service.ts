import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Request } from 'express'
import { SentryService } from '@core/sentry'
import { AuditLogRepository } from '../database/audit-log.repository'
import { AuditLog, AuditAction, AuditSeverity, AuditStatus } from '../entities/audit-log.entity'
import { User } from '@modules/users/entities/user.entity'
import { AuditContextFactory } from './audit-context.factory'
import { ContextUser } from '../types/context-user.interface'

export interface AuditContext {
  userId?: string
  username?: string
  email?: string
  ipAddress?: string
  userAgent?: string
  method?: string
  endpoint?: string
  requestId?: string
  metadata?: Record<string, any>
}

export interface LogActionOptions {
  action: AuditAction
  entityType?: string
  entityId?: string
  previousValues?: Record<string, any>
  newValues?: Record<string, any>
  status?: AuditStatus
  statusCode?: number
  errorMessage?: string
  errorStack?: string
  severity?: AuditSeverity
  tags?: string[]
  description?: string
  retentionDays?: number
  metadata?: Record<string, any>
}

@Injectable()
export class AuditService {
  constructor(
    private readonly auditLogRepository: AuditLogRepository,
    private readonly contextFactory: AuditContextFactory,
    private readonly configService: ConfigService,
    private readonly sentryService: SentryService,
    @InjectPinoLogger(AuditService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Extract audit context from HTTP request
   */
  extractContextFromRequest(req: Request & { user?: any }): AuditContext {
    return this.contextFactory.fromRequest(req)
  }

  createContextFromRequest(req: Request & { user?: any }, user?: ContextUser): AuditContext {
    const base = this.contextFactory.fromRequest(req)
    return user ? this.contextFactory.withUser(base, user) : base
  }

  /**
   * Merge user information into an existing context
   */
  withUser(context: AuditContext, user?: ContextUser): AuditContext {
    return this.contextFactory.withUser(context, user)
  }

  private isAuditEnabled(): boolean {
    return this.configService.get<boolean>('audit.enabled', true)
  }

  /**
   * Main logging method - logs any action with full context
   */
  async logAction(context: AuditContext, options: LogActionOptions): Promise<AuditLog | null> {
    if (!this.isAuditEnabled()) {
      return null
    }

    try {
      // Calculate changes if both previous and new values provided
      const changes = this.calculateChanges(options.previousValues, options.newValues)

      // Create audit log entity
      const repository = this.auditLogRepository.getRepository()
      const auditLog = repository.create({
        // User context
        userId: context.userId || null,
        username: context.username || null,
        email: context.email || null,

        // Action details
        action: options.action,
        entityType: options.entityType || null,
        entityId: options.entityId || null,

        // Changes
        previousValues: options.previousValues || null,
        newValues: options.newValues || null,
        changes: changes || null,

        // Request context
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
        method: context.method || null,
        endpoint: context.endpoint || null,
        requestId: context.requestId || null,

        // Status
        status: options.status || AuditStatus.SUCCESS,
        statusCode: options.statusCode || null,
        errorMessage: options.errorMessage || null,
        errorStack: options.errorStack || null,

        // Severity & metadata
        severity: options.severity || this.determineSeverity(options.action, options.status),
        tags: options.tags || null,
        metadata: options.metadata
          ? { ...(context.metadata ?? {}), ...options.metadata }
          : context.metadata,
        description: options.description || null,
        retentionDays: options.retentionDays || 0
      })

      // Save to database
      const saved = await repository.save(auditLog)

      // Invalidate caches for fresh reads
      await this.auditLogRepository.invalidateAllCaches()

      // Log to Pino for immediate visibility
      this.logToPino(saved)

      return saved
    } catch (error) {
      // Capture critical audit logging failures to Sentry
      this.sentryService.captureException(error, {
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId,
        userId: context.userId,
        severity: options.severity,
        errorContext: 'audit_log_creation_failed'
      })

      this.logger.error(
        {
          action: options.action,
          error: error.message,
          context
        },
        'Failed to create audit log'
      )
      throw error
    }
  }

  /**
   * Log entity creation
   */
  async logCreate(
    context: AuditContext,
    entityType: string,
    entityId: string,
    newValues: Record<string, any>,
    options?: Partial<LogActionOptions>
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.CREATE,
      entityType,
      entityId,
      newValues,
      description: `Created ${entityType} ${entityId}`,
      severity: AuditSeverity.LOW,
      ...options
    })
  }

  /**
   * Log entity update
   */
  async logUpdate(
    context: AuditContext,
    entityType: string,
    entityId: string,
    previousValues: Record<string, any>,
    newValues: Record<string, any>,
    options?: Partial<LogActionOptions>
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.UPDATE,
      entityType,
      entityId,
      previousValues,
      newValues,
      description: `Updated ${entityType} ${entityId}`,
      severity: AuditSeverity.LOW,
      ...options
    })
  }

  /**
   * Log entity deletion
   */
  async logDelete(
    context: AuditContext,
    entityType: string,
    entityId: string,
    previousValues?: Record<string, any>,
    options?: Partial<LogActionOptions>
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.DELETE,
      entityType,
      entityId,
      previousValues,
      description: `Deleted ${entityType} ${entityId}`,
      severity: AuditSeverity.MEDIUM,
      ...options
    })
  }

  /**
   * Log entity restore
   */
  async logRestore(
    context: AuditContext,
    entityType: string,
    entityId: string,
    options?: Partial<LogActionOptions>
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.RESTORE,
      entityType,
      entityId,
      description: `Restored ${entityType} ${entityId}`,
      severity: AuditSeverity.LOW,
      ...options
    })
  }

  /**
   * Log hard delete (permanent deletion)
   */
  async logHardDelete(
    context: AuditContext,
    entityType: string,
    entityId: string,
    previousValues?: Record<string, any>,
    options?: Partial<LogActionOptions>
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.HARD_DELETE,
      entityType,
      entityId,
      previousValues,
      description: `Permanently deleted ${entityType} ${entityId}`,
      severity: AuditSeverity.HIGH,
      tags: ['permanent_delete', 'irreversible'],
      ...options
    })
  }

  /**
   * Log successful login
   */
  async logLogin(context: AuditContext, metadata?: Record<string, any>): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.LOGIN,
      description: `User logged in`,
      severity: AuditSeverity.LOW,
      tags: ['authentication'],
      ...(metadata && { metadata })
    })
  }

  async logLoginFromRequest(
    req: Request & { user?: any },
    user?: ContextUser,
    metadata?: Record<string, any>
  ) {
    return this.logLogin(this.createContextFromRequest(req, user), metadata)
  }

  /**
   * Log logout
   */
  async logLogout(context: AuditContext, metadata?: Record<string, any>): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.LOGOUT,
      description: `User logged out`,
      severity: AuditSeverity.LOW,
      tags: ['authentication'],
      ...(metadata && { metadata })
    })
  }

  async logLogoutFromRequest(
    req: Request & { user?: any },
    user?: ContextUser,
    metadata?: Record<string, any>
  ) {
    return this.logLogout(this.createContextFromRequest(req, user), metadata)
  }

  /**
   * Log logout from all devices
   */
  async logLogoutAll(context: AuditContext, sessionCount: number): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.LOGOUT_ALL,
      description: `User logged out from all devices (${sessionCount} sessions)`,
      severity: AuditSeverity.MEDIUM,
      tags: ['authentication', 'security'],
      metadata: { sessionCount }
    })
  }

  async logLogoutAllFromRequest(
    req: Request & { user?: any },
    sessionCount: number,
    user?: ContextUser
  ) {
    return this.logLogoutAll(this.createContextFromRequest(req, user), sessionCount)
  }

  /**
   * Log password change
   */
  async logPasswordChange(
    context: AuditContext,
    forced: boolean = false
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: forced ? AuditAction.FORCE_PASSWORD_CHANGE : AuditAction.CHANGE_PASSWORD,
      description: forced ? 'Password changed (forced)' : 'Password changed',
      severity: AuditSeverity.MEDIUM,
      tags: ['security', 'password'],
      metadata: { forced }
    })
  }

  async logPasswordChangeFromRequest(
    req: Request & { user?: any },
    forced: boolean = false,
    user?: ContextUser
  ) {
    return this.logPasswordChange(this.createContextFromRequest(req, user), forced)
  }

  /**
   * Log password reset
   */
  async logPasswordReset(
    context: AuditContext,
    resetByAdmin: boolean = false
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.RESET_PASSWORD,
      description: resetByAdmin ? 'Password reset by admin' : 'Password reset',
      severity: resetByAdmin ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
      tags: ['security', 'password', resetByAdmin ? 'admin_action' : 'self_service'],
      metadata: { resetByAdmin }
    })
  }

  async logPasswordResetFromRequest(
    req: Request & { user?: any },
    resetByAdmin: boolean = false,
    user?: ContextUser
  ) {
    return this.logPasswordReset(this.createContextFromRequest(req, user), resetByAdmin)
  }

  /**
   * Log role assignment
   */
  async logRoleAssign(
    context: AuditContext,
    targetUserId: string,
    roleId: string,
    roleName: string
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.ROLE_ASSIGN,
      entityType: 'User',
      entityId: targetUserId,
      description: `Assigned role '${roleName}' to user`,
      severity: AuditSeverity.HIGH,
      tags: ['acl', 'role_management'],
      metadata: { roleId, roleName, targetUserId }
    })
  }

  /**
   * Log role revocation
   */
  async logRoleRevoke(
    context: AuditContext,
    targetUserId: string,
    roleId: string,
    roleName: string
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.ROLE_REVOKE,
      entityType: 'User',
      entityId: targetUserId,
      description: `Revoked role '${roleName}' from user`,
      severity: AuditSeverity.HIGH,
      tags: ['acl', 'role_management'],
      metadata: { roleId, roleName, targetUserId }
    })
  }

  /**
   * Log file upload
   */
  async logFileUpload(
    context: AuditContext,
    filename: string,
    fileSize: number,
    mimeType: string,
    attachmentId?: string
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.FILE_UPLOAD,
      entityType: 'Attachment',
      entityId: attachmentId,
      description: `Uploaded file: ${filename}`,
      severity: AuditSeverity.LOW,
      tags: ['file_operation'],
      metadata: { filename, fileSize, mimeType }
    })
  }

  /**
   * Log file download
   */
  async logFileDownload(
    context: AuditContext,
    filename: string,
    attachmentId: string
  ): Promise<AuditLog> {
    return this.logAction(context, {
      action: AuditAction.FILE_DOWNLOAD,
      entityType: 'Attachment',
      entityId: attachmentId,
      description: `Downloaded file: ${filename}`,
      severity: AuditSeverity.LOW,
      tags: ['file_operation'],
      metadata: { filename }
    })
  }

  /**
   * Log unauthorized access attempt
   */
  async logUnauthorizedAccess(
    context: AuditContext,
    resource: string,
    reason: string
  ): Promise<AuditLog> {
    // Capture unauthorized access to Sentry for security monitoring
    this.sentryService.captureMessage(`Unauthorized access attempt to ${resource}`, 'warning', {
      userId: context.userId,
      resource,
      reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    })

    return this.logAction(context, {
      action: AuditAction.UNAUTHORIZED_ACCESS,
      description: `Unauthorized access to ${resource}: ${reason}`,
      status: AuditStatus.FAILURE,
      statusCode: 403,
      severity: AuditSeverity.HIGH,
      tags: ['security', 'unauthorized'],
      metadata: { resource, reason },
      retentionDays: 365 // Keep security logs for 1 year
    })
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(
    context: AuditContext,
    activityType: string,
    details: Record<string, any>
  ): Promise<AuditLog> {
    // Capture suspicious activity to Sentry with high priority
    this.sentryService.captureMessage(`Suspicious activity detected: ${activityType}`, 'error', {
      userId: context.userId,
      activityType,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      ...details
    })

    return this.logAction(context, {
      action: AuditAction.SUSPICIOUS_ACTIVITY,
      description: `Suspicious activity detected: ${activityType}`,
      severity: AuditSeverity.CRITICAL,
      tags: ['security', 'suspicious', 'alert'],
      metadata: { activityType, ...details },
      retentionDays: 365
    })
  }

  /**
   * Log bulk operations
   */
  async logBulkOperation(
    context: AuditContext,
    operation: 'create' | 'update' | 'delete',
    entityType: string,
    count: number,
    entityIds?: string[]
  ): Promise<AuditLog> {
    const actionMap = {
      create: AuditAction.BULK_CREATE,
      update: AuditAction.BULK_UPDATE,
      delete: AuditAction.BULK_DELETE
    }

    return this.logAction(context, {
      action: actionMap[operation],
      entityType,
      description: `Bulk ${operation} of ${count} ${entityType} records`,
      severity: AuditSeverity.MEDIUM,
      tags: ['bulk_operation'],
      metadata: { count, entityIds }
    })
  }

  /**
   * Calculate changes between previous and new values
   */
  private calculateChanges(
    previousValues?: Record<string, any>,
    newValues?: Record<string, any>
  ): Record<string, any> | null {
    if (!previousValues || !newValues) {
      return null
    }

    const changes: Record<string, any> = {}
    const allKeys = new Set([...Object.keys(previousValues), ...Object.keys(newValues)])

    allKeys.forEach(key => {
      const oldValue = previousValues[key]
      const newValue = newValues[key]

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[key] = {
          from: oldValue,
          to: newValue
        }
      }
    })

    return Object.keys(changes).length > 0 ? changes : null
  }

  /**
   * Determine severity based on action and status
   */
  private determineSeverity(action: AuditAction, status?: AuditStatus): AuditSeverity {
    // Failed operations are always at least medium severity
    if (status === AuditStatus.FAILURE) {
      return AuditSeverity.MEDIUM
    }

    // High-risk actions
    const highRiskActions = [
      AuditAction.HARD_DELETE,
      AuditAction.ROLE_ASSIGN,
      AuditAction.ROLE_REVOKE,
      AuditAction.PERMISSION_GRANT,
      AuditAction.PERMISSION_REVOKE,
      AuditAction.SYSTEM_CONFIG_CHANGE,
      AuditAction.FORCE_PASSWORD_CHANGE
    ]

    if (highRiskActions.includes(action)) {
      return AuditSeverity.HIGH
    }

    // Security-related actions
    const securityActions = [
      AuditAction.UNAUTHORIZED_ACCESS,
      AuditAction.SUSPICIOUS_ACTIVITY,
      AuditAction.SECURITY_VIOLATION
    ]

    if (securityActions.includes(action)) {
      return AuditSeverity.CRITICAL
    }

    // Medium-risk actions
    const mediumRiskActions = [
      AuditAction.DELETE,
      AuditAction.RESET_PASSWORD,
      AuditAction.CHANGE_PASSWORD,
      AuditAction.LOGOUT_ALL,
      AuditAction.BULK_DELETE
    ]

    if (mediumRiskActions.includes(action)) {
      return AuditSeverity.MEDIUM
    }

    // Everything else is low severity
    return AuditSeverity.LOW
  }

  /**
   * Log to Pino for immediate visibility
   */
  private logToPino(auditLog: AuditLog): void {
    const logData = {
      auditLogId: auditLog.id,
      userId: auditLog.userId,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      status: auditLog.status,
      severity: auditLog.severity,
      ipAddress: auditLog.ipAddress,
      requestId: auditLog.requestId
    }

    switch (auditLog.severity) {
      case AuditSeverity.CRITICAL:
        this.logger.error(logData, `AUDIT: ${auditLog.description || auditLog.action}`)
        break
      case AuditSeverity.HIGH:
        this.logger.warn(logData, `AUDIT: ${auditLog.description || auditLog.action}`)
        break
      default:
        this.logger.info(logData, `AUDIT: ${auditLog.description || auditLog.action}`)
    }
  }
}
