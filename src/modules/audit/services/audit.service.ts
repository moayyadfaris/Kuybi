import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { errorMessage } from '@shared/utils/error.util'
import { Request } from 'express'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { SentryService } from '@core/sentry'

import { AuditLogRepository } from '../database/audit-log.repository'
import { AuditAction, AuditLog, AuditSeverity, AuditStatus } from '../entities/audit-log.entity'
import { ContextUser } from '../types/context-user.interface'

import { AuditContextFactory } from './audit-context.factory'

export interface AuditContext {
  userId?: string | null
  username?: string | null
  email?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  method?: string | null
  endpoint?: string | null
  requestId?: string | null
  metadata?: Record<string, unknown>
}

export interface LogActionOptions {
  action: AuditAction
  entityType?: string
  entityId?: string
  previousValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  status?: AuditStatus
  statusCode?: number
  errorMessage?: string
  errorStack?: string
  severity?: AuditSeverity
  tags?: string[]
  description?: string
  retentionDays?: number
  metadata?: Record<string, unknown>
}

/**
 * Writes the audit trail: one row per security-relevant or administrative action, with
 * who did it, from where, what changed and how severe it is. Read through AuditQueryService.
 */
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

  createContextFromRequest(req: Request, user?: ContextUser): AuditContext {
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
   * Records an action. Best effort: the action it describes has already happened, so a
   * failed write is reported (Sentry, error log) and returns null instead of failing the
   * request that did the action.
   */
  async logAction(context: AuditContext, options: LogActionOptions): Promise<AuditLog | null> {
    if (!this.isAuditEnabled()) {
      return null
    }

    try {
      // Calculate changes if both previous and new values provided
      const changes = this.calculateChanges(options.previousValues, options.newValues)

      const saved = await this.auditLogRepository.append({
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
        { action: options.action, userId: context.userId, error: errorMessage(error) },
        'Failed to create audit log'
      )
      return null
    }
  }

  /**
   * Log entity creation
   */
  async logCreate(
    context: AuditContext,
    entityType: string,
    entityId: string,
    newValues: Record<string, unknown>,
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
   * Log successful login
   */
  async logLogin(
    context: AuditContext,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.LOGIN,
      description: `User logged in`,
      severity: AuditSeverity.LOW,
      tags: ['authentication'],
      ...(metadata && { metadata })
    })
  }

  async logLoginFromRequest(req: Request, user?: ContextUser, metadata?: Record<string, unknown>) {
    return this.logLogin(this.createContextFromRequest(req, user), metadata)
  }

  /**
   * Log logout
   */
  async logLogout(
    context: AuditContext,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog | null> {
    return this.logAction(context, {
      action: AuditAction.LOGOUT,
      description: `User logged out`,
      severity: AuditSeverity.LOW,
      tags: ['authentication'],
      ...(metadata && { metadata })
    })
  }

  async logLogoutFromRequest(req: Request, user?: ContextUser, metadata?: Record<string, unknown>) {
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

  async logLogoutAllFromRequest(req: Request, sessionCount: number, user?: ContextUser) {
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
    req: Request,
    resetByAdmin: boolean = false,
    user?: ContextUser
  ) {
    return this.logPasswordReset(this.createContextFromRequest(req, user), resetByAdmin)
  }

  /**
   * Calculate changes between previous and new values
   */
  private calculateChanges(
    previousValues?: Record<string, unknown>,
    newValues?: Record<string, unknown>
  ): Record<string, unknown> | null {
    if (!previousValues || !newValues) {
      return null
    }

    const changes: Record<string, unknown> = {}
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
