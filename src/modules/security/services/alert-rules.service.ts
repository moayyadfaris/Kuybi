import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { AlertRule, AlertRuleType, AlertSeverity, AlertStatus, RuleCondition } from '../entities/alert-rule.entity'
import { AuditLog, AuditAction } from '@modules/audit/entities/audit-log.entity'
import { BaseRepository } from '@core/database/repositories/base.repository'
import { CacheService } from '@core/cache/services/cache.service'

export interface AlertRuleFilters {
  type?: AlertRuleType
  severity?: AlertSeverity
  status?: AlertStatus
  enabled?: boolean
  category?: string
  tags?: string[]
}

export interface AlertRuleSearchResult {
  rules: AlertRule[]
  total: number
  page: number
  limit: number
  totalPages: number
}

@Injectable()
export class AlertRulesService extends BaseRepository<AlertRule> {
  protected entityName = 'alert_rule'
  protected defaultTTL = 300

  constructor(
    @InjectRepository(AlertRule)
    repository: Repository<AlertRule>,
    cacheService: CacheService,
    @InjectPinoLogger(AlertRulesService.name)
    private readonly logger: PinoLogger
  ) {
    super(repository, cacheService)
  }

  /**
   * Find rules that match an audit log event
   */
  async findMatchingRules(auditLog: AuditLog): Promise<AlertRule[]> {
    const rules = await this.findEnabledRules()

    return rules.filter(rule => this.evaluateRuleConditions(rule, auditLog))
  }

  /**
   * Get all enabled rules
   */
  async findEnabledRules(): Promise<AlertRule[]> {
    return this.repository.find({
      where: {
        enabled: true,
        status: AlertStatus.ACTIVE
      },
      cache: this.defaultTTL
    })
  }

  /**
   * Evaluate if a rule's conditions match an audit log
   */
  private evaluateRuleConditions(rule: AlertRule, auditLog: AuditLog): boolean {
    return rule.conditions.every(condition => this.evaluateCondition(condition, auditLog))
  }

  /**
   * Evaluate a single condition against an audit log
   */
  private evaluateCondition(condition: RuleCondition, auditLog: AuditLog): boolean {
    const fieldValue = this.getFieldValue(auditLog, condition.field)

    switch (condition.operator) {
      case 'eq':
        return fieldValue === condition.value
      case 'neq':
        return fieldValue !== condition.value
      case 'gt':
        return typeof fieldValue === 'number' && fieldValue > condition.value
      case 'gte':
        return typeof fieldValue === 'number' && fieldValue >= condition.value
      case 'lt':
        return typeof fieldValue === 'number' && fieldValue < condition.value
      case 'lte':
        return typeof fieldValue === 'number' && fieldValue <= condition.value
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(condition.value)
      case 'regex':
        return typeof fieldValue === 'string' && new RegExp(condition.value).test(fieldValue)
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue)
      default:
        return false
    }
  }

  /**
   * Get field value from audit log using dot notation
   */
  private getFieldValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  /**
   * Create predefined security rules
   */
  async createDefaultRules(): Promise<void> {
    const defaultRules = [
      // Brute force detection
      {
        name: 'Brute Force Login Attempts',
        description: 'Multiple failed login attempts from same IP',
        type: AlertRuleType.THRESHOLD,
        severity: AlertSeverity.HIGH,
        conditions: [
          {
            field: 'action',
            operator: 'eq' as const,
            value: AuditAction.LOGIN
          },
          {
            field: 'status',
            operator: 'eq' as const,
            value: 'failure'
          }
        ],
        actions: [
          {
            type: 'email' as const,
            config: { template: 'brute-force-alert' },
            delayMinutes: 0
          }
        ],
        thresholdCount: 5,
        cooldownMinutes: 30,
        category: 'authentication',
        tags: ['brute-force', 'security']
      },

      // Privilege escalation
      {
        name: 'Privilege Escalation',
        description: 'User role assignment detected',
        type: AlertRuleType.PATTERN,
        severity: AlertSeverity.CRITICAL,
        conditions: [
          {
            field: 'action',
            operator: 'eq' as const,
            value: AuditAction.ROLE_ASSIGN
          }
        ],
        actions: [
          {
            type: 'email' as const,
            config: { template: 'privilege-escalation' },
            delayMinutes: 0
          }
        ],
        cooldownMinutes: 5,
        category: 'authorization',
        tags: ['privilege', 'critical']
      },

      // Unauthorized access
      {
        name: 'Unauthorized Access Attempts',
        description: 'Unauthorized access to resources',
        type: AlertRuleType.PATTERN,
        severity: AlertSeverity.HIGH,
        conditions: [
          {
            field: 'action',
            operator: 'eq' as const,
            value: AuditAction.UNAUTHORIZED_ACCESS
          }
        ],
        actions: [
          {
            type: 'email' as const,
            config: { template: 'unauthorized-access' },
            delayMinutes: 0
          }
        ],
        cooldownMinutes: 15,
        category: 'access-control',
        tags: ['unauthorized', 'security']
      },

      // Suspicious activity
      {
        name: 'Suspicious Activity Detection',
        description: 'AI-detected suspicious user behavior',
        type: AlertRuleType.ANOMALY,
        severity: AlertSeverity.CRITICAL,
        conditions: [
          {
            field: 'action',
            operator: 'eq' as const,
            value: AuditAction.SUSPICIOUS_ACTIVITY
          }
        ],
        actions: [
          {
            type: 'email' as const,
            config: { template: 'suspicious-activity' },
            delayMinutes: 0
          }
        ],
        cooldownMinutes: 10,
        category: 'threat-detection',
        tags: ['suspicious', 'ai-detected']
      }
    ]

    for (const ruleData of defaultRules) {
      const existing = await this.repository.findOne({ where: { name: ruleData.name } })
      if (!existing) {
        await this.repository.save(this.repository.create(ruleData))
        this.logger.info({ ruleName: ruleData.name }, 'Created default alert rule')
      }
    }
  }

  /**
   * Search and filter alert rules
   */
  async searchRules(
    filters: AlertRuleFilters,
    pagination: { page?: number; limit?: number } = {}
  ): Promise<AlertRuleSearchResult> {
    const { page = 1, limit = 50 } = pagination
    const skip = (page - 1) * limit

    const qb = this.applyFilters(this.repository.createQueryBuilder('rule'), filters)
      .orderBy('rule.createdAt', 'DESC')

    const [rules, total] = await qb.skip(skip).take(limit).getManyAndCount()

    return {
      rules,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  }

  /**
   * Apply filters to query builder
   */
  private applyFilters(qb: SelectQueryBuilder<AlertRule>, filters: AlertRuleFilters): SelectQueryBuilder<AlertRule> {
    if (filters.type) {
      qb.andWhere('rule.type = :type', { type: filters.type })
    }

    if (filters.severity) {
      qb.andWhere('rule.severity = :severity', { severity: filters.severity })
    }

    if (filters.status) {
      qb.andWhere('rule.status = :status', { status: filters.status })
    }

    if (filters.enabled !== undefined) {
      qb.andWhere('rule.enabled = :enabled', { enabled: filters.enabled })
    }

    if (filters.category) {
      qb.andWhere('rule.category = :category', { category: filters.category })
    }

    if (filters.tags && filters.tags.length > 0) {
      qb.andWhere('rule.tags @> :tags', { tags: JSON.stringify(filters.tags) })
    }

    return qb
  }

  /**
   * Validate rule configuration
   */
  validateRule(rule: Partial<AlertRule>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!rule.name?.trim()) {
      errors.push('Rule name is required')
    }

    if (!rule.conditions || rule.conditions.length === 0) {
      errors.push('At least one condition is required')
    }

    if (!rule.actions || rule.actions.length === 0) {
      errors.push('At least one action is required')
    }

    // Validate conditions
    rule.conditions?.forEach((condition, index) => {
      if (!condition.field) {
        errors.push(`Condition ${index + 1}: field is required`)
      }
      if (!condition.operator) {
        errors.push(`Condition ${index + 1}: operator is required`)
      }
    })

    // Validate actions
    rule.actions?.forEach((action, index) => {
      if (!action.type) {
        errors.push(`Action ${index + 1}: type is required`)
      }
    })

    return {
      valid: errors.length === 0,
      errors
    }
  }
}