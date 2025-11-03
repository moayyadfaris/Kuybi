import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { AlertRule } from '../entities/alert-rule.entity'
import { Alert, AlertStatus, AlertSource } from '../entities/alert.entity'
import { AlertEscalation, NotificationChannel, EscalationStatus } from '../entities/alert-escalation.entity'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'

export interface CreateAlertOptions {
  title?: string
  description?: string
  assignedToId?: string
  tags?: string[]
  metadata?: Record<string, any>
}

@Injectable()
export class AlertManagerService {
  constructor(
    @InjectRepository(Alert)
    private readonly alertRepository: Repository<Alert>,
    @InjectRepository(AlertEscalation)
    private readonly escalationRepository: Repository<AlertEscalation>,
    @InjectPinoLogger(AlertManagerService.name)
    private readonly logger: PinoLogger
  ) {}

  /**
   * Create a new alert from a rule trigger
   */
  async createAlert(rule: AlertRule, auditLog: AuditLog, options: CreateAlertOptions = {}): Promise<Alert> {
    const title = options.title || this.generateAlertTitle(rule, auditLog)
    const description = options.description || this.generateAlertDescription(rule, auditLog)

    // Create alert entity
    const alertData = {
      ruleId: rule.id,
      title,
      description,
      severity: rule.severity,
      source: AlertSource.AUDIT_LOG,
      status: AlertStatus.ACTIVE,
      relatedEntities: {
        auditLogIds: [auditLog.id],
        userIds: auditLog.userId ? [auditLog.userId] : [],
        entityTypes: auditLog.entityType ? [auditLog.entityType] : [],
        entityIds: auditLog.entityId ? [auditLog.entityId] : []
      },
      assignedToId: options.assignedToId || null,
      triggerData: {
        auditLogId: auditLog.id,
        ruleId: rule.id,
        timestamp: auditLog.createdAt
      },
      context: {
        userId: auditLog.userId,
        username: auditLog.username,
        email: auditLog.email,
        ipAddress: auditLog.ipAddress,
        userAgent: auditLog.userAgent,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId
      },
      tags: options.tags || rule.tags || [],
      metadata: options.metadata || {}
    }

    const alert = this.alertRepository.create(alertData as any)
    const savedAlert = await this.alertRepository.save(alert)

    // Create escalations based on rule actions
    await this.createEscalations(savedAlert, rule)

    this.logger.info({
      alertId: (savedAlert as any).id,
      ruleId: rule.id,
      severity: rule.severity,
      title: (savedAlert as any).title
    }, 'Created security alert')

    return savedAlert as any
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string, notes?: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id: alertId } })

    if (!alert) {
      throw new Error(`Alert ${alertId} not found`)
    }

    if (alert.status !== AlertStatus.ACTIVE) {
      throw new Error(`Alert ${alertId} is not in active state`)
    }

    alert.status = AlertStatus.ACKNOWLEDGED
    alert.acknowledgedAt = new Date()
    alert.acknowledgedById = userId
    alert.resolutionNotes = notes

    const updated = await this.alertRepository.save(alert)

    // Cancel pending escalations
    await this.cancelPendingEscalations(alertId)

    this.logger.info({
      alertId,
      acknowledgedBy: userId,
      timeToAcknowledge: alert.timeToAcknowledge
    }, 'Alert acknowledged')

    return updated
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string, notes?: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id: alertId } })

    if (!alert) {
      throw new Error(`Alert ${alertId} not found`)
    }

    if (alert.status === AlertStatus.RESOLVED || alert.status === AlertStatus.FALSE_POSITIVE) {
      throw new Error(`Alert ${alertId} is already resolved`)
    }

    alert.status = AlertStatus.RESOLVED
    alert.resolvedAt = new Date()
    alert.resolvedById = userId
    alert.resolutionNotes = (alert.resolutionNotes || '') + (notes ? `\n${notes}` : '')

    const updated = await this.alertRepository.save(alert)

    // Cancel pending escalations
    await this.cancelPendingEscalations(alertId)

    this.logger.info({
      alertId,
      resolvedBy: userId,
      timeToResolve: alert.timeToResolve
    }, 'Alert resolved')

    return updated
  }

  /**
   * Mark alert as false positive
   */
  async markAsFalsePositive(alertId: string, userId: string, notes?: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id: alertId } })

    if (!alert) {
      throw new Error(`Alert ${alertId} not found`)
    }

    alert.status = AlertStatus.FALSE_POSITIVE
    alert.resolvedAt = new Date()
    alert.resolvedById = userId
    alert.resolutionNotes = notes

    const updated = await this.alertRepository.save(alert)

    // Cancel pending escalations
    await this.cancelPendingEscalations(alertId)

    this.logger.info({ alertId, markedBy: userId }, 'Alert marked as false positive')

    return updated
  }

  /**
   * Assign alert to user
   */
  async assignAlert(alertId: string, userId: string, assignedById: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id: alertId } })

    if (!alert) {
      throw new Error(`Alert ${alertId} not found`)
    }

    alert.assignedToId = userId
    // alert.updatedById = assignedById // TODO: Add to entity if needed

    const updated = await this.alertRepository.save(alert)

    this.logger.info({
      alertId,
      assignedTo: userId,
      assignedBy: assignedById
    }, 'Alert assigned')

    return updated
  }

  /**
   * Escalate alert manually
   */
  async escalateAlert(alertId: string, userId: string): Promise<void> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId },
      relations: ['escalations']
    })

    if (!alert) {
      throw new Error(`Alert ${alertId} not found`)
    }

    // Find next escalation level
    const currentLevel = Math.max(...alert.escalations.map(e => e.level), 0)
    const nextEscalation = alert.escalations.find(e => e.level === currentLevel + 1)

    if (!nextEscalation) {
      throw new Error(`No further escalation levels available for alert ${alertId}`)
    }

    // TODO: Send immediate notification - will be implemented with notification service
    this.logger.info({
      alertId,
      escalationId: nextEscalation.id,
      channel: nextEscalation.channel,
      recipients: nextEscalation.recipients
    }, 'Alert escalation notification would be sent')

    alert.lastEscalatedAt = new Date()
    alert.escalationCount += 1
    await this.alertRepository.save(alert)

    this.logger.warn({
      alertId,
      escalationLevel: nextEscalation.level,
      escalatedBy: userId
    }, 'Alert manually escalated')
  }

  /**
   * Create escalations for alert based on rule actions
   */
  private async createEscalations(alert: any, rule: AlertRule): Promise<void> {
    const escalations: Partial<AlertEscalation>[] = []

    for (const action of rule.actions) {
      // Create escalation for each action
      const escalation: Partial<AlertEscalation> = {
        alertId: alert.id,
        level: 1, // Start with level 1
        channel: this.mapActionTypeToChannel(action.type),
        recipients: await this.getRecipientsForAction(action),
        delayMinutes: action.delayMinutes || 0,
        scheduledFor: action.delayMinutes
          ? new Date(Date.now() + action.delayMinutes * 60 * 1000)
          : new Date(),
        channelConfig: action.config
      }

      escalations.push(escalation)
    }

    if (escalations.length > 0) {
      await this.escalationRepository.save(escalations.map(e => this.escalationRepository.create(e)))
    }
  }

  /**
   * Cancel pending escalations
   */
  private async cancelPendingEscalations(alertId: string): Promise<void> {
    await this.escalationRepository.update(
      { alertId, status: EscalationStatus.PENDING },
      { status: EscalationStatus.ACKNOWLEDGED }
    )
  }

  /**
   * Generate alert title
   */
  private generateAlertTitle(rule: AlertRule, auditLog: AuditLog): string {
    const action = auditLog.action.replace(/_/g, ' ').toUpperCase()
    const entity = auditLog.entityType ? `${auditLog.entityType} ` : ''
    const user = auditLog.username || auditLog.email || 'Unknown User'

    return `${action}: ${entity}${user}`
  }

  /**
   * Generate alert description
   */
  private generateAlertDescription(rule: AlertRule, auditLog: AuditLog): string {
    let description = `Alert triggered by rule: ${rule.name}\n\n`
    description += `Action: ${auditLog.action}\n`
    description += `User: ${auditLog.username || auditLog.email || 'Unknown'}\n`
    description += `IP Address: ${auditLog.ipAddress || 'Unknown'}\n`
    description += `Timestamp: ${auditLog.createdAt.toISOString()}\n`

    if (auditLog.entityType && auditLog.entityId) {
      description += `Entity: ${auditLog.entityType} (${auditLog.entityId})\n`
    }

    if (auditLog.errorMessage) {
      description += `Error: ${auditLog.errorMessage}\n`
    }

    return description
  }

  /**
   * Map action type to notification channel
   */
  private mapActionTypeToChannel(actionType: string): NotificationChannel {
    switch (actionType) {
      case 'email':
        return NotificationChannel.EMAIL
      case 'sms':
        return NotificationChannel.SMS
      case 'webhook':
        return NotificationChannel.WEBHOOK
      case 'slack':
        return NotificationChannel.SLACK
      case 'pagerduty':
        return NotificationChannel.PAGERDUTY
      default:
        return NotificationChannel.EMAIL
    }
  }

  /**
   * Get recipients for action
   */
  private async getRecipientsForAction(action: any): Promise<string[]> {
    // TODO: Implement recipient resolution based on action config
    // For now, return configured recipients or default security team
    return action.config?.recipients || ['security@company.com']
  }
}