import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'
import { AlertRulesService } from './alert-rules.service'
import { AlertManagerService } from './alert-manager.service'
import { CacheService } from '@core/cache/services/cache.service'

@Injectable()
export class SecurityEventProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly eventQueue: AuditLog[] = []
  private processingInterval?: NodeJS.Timeout
  private isProcessing = false

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly alertRulesService: AlertRulesService,
    private readonly alertManagerService: AlertManagerService,
    private readonly cacheService: CacheService,
    @InjectPinoLogger(SecurityEventProcessorService.name)
    private readonly logger: PinoLogger
  ) {}

  onModuleInit() {
    // Process events every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processQueuedEvents()
    }, 5000)
  }

  onModuleDestroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
    }
  }

  /**
   * Listen for audit log creation events
   */
  @OnEvent('audit.log.created')
  async handleAuditLogCreated(auditLog: AuditLog) {
    this.logger.debug({ auditLogId: auditLog.id, action: auditLog.action }, 'Received audit log event')

    // Add to processing queue
    this.eventQueue.push(auditLog)

    // Process immediately for critical events
    if (this.isCriticalEvent(auditLog)) {
      await this.processEventImmediately(auditLog)
    }
  }

  /**
   * Process events in the queue
   */
  private async processQueuedEvents() {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      // Process events in batches
      const batchSize = 10
      const eventsToProcess = this.eventQueue.splice(0, batchSize)

      for (const auditLog of eventsToProcess) {
        await this.processAuditLog(auditLog)
      }

      if (eventsToProcess.length > 0) {
        this.logger.debug({ processed: eventsToProcess.length, remaining: this.eventQueue.length }, 'Processed audit log batch')
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to process audit log batch')
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Process a single audit log event
   */
  private async processAuditLog(auditLog: AuditLog) {
    try {
      // Find matching alert rules
      const matchingRules = await this.alertRulesService.findMatchingRules(auditLog)

      if (matchingRules.length === 0) {
        return // No rules match this event
      }

      this.logger.info({
        auditLogId: auditLog.id,
        action: auditLog.action,
        matchingRules: matchingRules.length
      }, 'Found matching alert rules')

      // Evaluate each rule and create alerts
      for (const rule of matchingRules) {
        try {
          // Check cooldown period
          const cooldownKey = `alert_cooldown:${rule.id}:${this.getCooldownKey(auditLog)}`
          const lastAlertTime = await this.cacheService.get<number>(cooldownKey)

          if (lastAlertTime) {
            const cooldownMs = rule.cooldownMinutes * 60 * 1000
            if (Date.now() - lastAlertTime < cooldownMs) {
              this.logger.debug({ ruleId: rule.id, cooldownMinutes: rule.cooldownMinutes }, 'Alert rule in cooldown')
              continue
            }
          }

          // Evaluate threshold if applicable
          if (rule.type === 'threshold' && rule.thresholdCount && rule.thresholdCount > 1) {
            const shouldTrigger = await this.evaluateThreshold(rule, auditLog)
            if (!shouldTrigger) continue
          }

          // Create alert
          const alert = await this.alertManagerService.createAlert(rule, auditLog)

          // Set cooldown
          await this.cacheService.set(cooldownKey, Date.now(), rule.cooldownMinutes * 60)

          this.logger.info({
            alertId: alert.id,
            ruleId: rule.id,
            auditLogId: auditLog.id,
            severity: rule.severity
          }, 'Created security alert')

        } catch (error) {
          this.logger.error({
            error: error.message,
            ruleId: rule.id,
            auditLogId: auditLog.id
          }, 'Failed to process alert rule')
        }
      }

    } catch (error) {
      this.logger.error({
        error: error.message,
        auditLogId: auditLog.id
      }, 'Failed to process audit log event')
    }
  }

  /**
   * Process critical events immediately
   */
  private async processEventImmediately(auditLog: AuditLog) {
    this.logger.warn({ auditLogId: auditLog.id, action: auditLog.action }, 'Processing critical event immediately')

    // Remove from queue if present
    const index = this.eventQueue.findIndex(log => log.id === auditLog.id)
    if (index > -1) {
      this.eventQueue.splice(index, 1)
    }

    await this.processAuditLog(auditLog)
  }

  /**
   * Check if event is critical and needs immediate processing
   */
  private isCriticalEvent(auditLog: AuditLog): boolean {
    const criticalActions = [
      'suspicious_activity',
      'security_violation',
      'unauthorized_access',
      'hard_delete'
    ]

    return criticalActions.includes(auditLog.action) ||
           auditLog.severity === 'critical' ||
           auditLog.status === 'failure'
  }

  /**
   * Generate cooldown key for alert rule
   */
  private getCooldownKey(auditLog: AuditLog): string {
    // Create a key based on user, IP, and action to prevent spam
    return `${auditLog.userId || 'anonymous'}:${auditLog.ipAddress || 'unknown'}:${auditLog.action}`
  }

  /**
   * Evaluate threshold-based rules
   */
  private async evaluateThreshold(rule: any, auditLog: AuditLog): Promise<boolean> {
    const timeWindowMs = (rule.conditions.find((c: any) => c.timeWindowMinutes)?.timeWindowMinutes || 60) * 60 * 1000
    const windowStart = Date.now() - timeWindowMs

    // Count similar events in time window
    const cacheKey = `threshold:${rule.id}:${this.getCooldownKey(auditLog)}`
    const eventCount = (await this.cacheService.get<number>(cacheKey)) || 0

    const newCount = eventCount + 1
    await this.cacheService.set(cacheKey, newCount, Math.ceil(timeWindowMs / 1000))

    return newCount >= rule.thresholdCount
  }

  /**
   * Get processing statistics
   */
  getProcessingStats() {
    return {
      queueLength: this.eventQueue.length,
      isProcessing: this.isProcessing
    }
  }
}