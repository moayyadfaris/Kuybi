import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn
} from 'typeorm'
import { User } from '@modules/users/entities/user.entity'

export enum AlertRuleType {
  THRESHOLD = 'threshold',
  PATTERN = 'pattern',
  ANOMALY = 'anomaly',
  COMPLIANCE = 'compliance'
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AlertStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DRAFT = 'draft'
}

export interface RuleCondition {
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex' | 'in'
  value: any
  timeWindowMinutes?: number
}

export interface AlertAction {
  type: 'email' | 'sms' | 'webhook' | 'slack' | 'pagerduty'
  config: Record<string, any>
  delayMinutes?: number
}

@Entity('alert_rules')
@Index(['type', 'severity'])
@Index(['enabled', 'status'])
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', length: 255 })
  name: string

  @Column({ type: 'text', nullable: true })
  description: string

  @Column({
    type: 'enum',
    enum: AlertRuleType
  })
  type: AlertRuleType

  @Column({
    type: 'enum',
    enum: AlertSeverity,
    default: AlertSeverity.MEDIUM
  })
  severity: AlertSeverity

  @Column({
    type: 'enum',
    enum: AlertStatus,
    default: AlertStatus.ACTIVE
  })
  status: AlertStatus

  @Column({ type: 'boolean', default: true })
  enabled: boolean

  @Column({ type: 'jsonb' })
  conditions: RuleCondition[]

  @Column({ type: 'jsonb' })
  actions: AlertAction[]

  @Column({ type: 'int', default: 60 }) // Minutes
  cooldownMinutes: number

  @Column({ type: 'int', nullable: true })
  thresholdCount: number

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string

  @Column({ type: 'jsonb', nullable: true })
  tags: string[]

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>

  // Audit fields
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updatedById' })
  updatedBy?: User

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Computed properties
  get isActive(): boolean {
    return this.enabled && this.status === AlertStatus.ACTIVE
  }

  get shouldTrigger(): boolean {
    // Basic validation - can be extended with more complex logic
    return this.conditions.length > 0 && this.actions.length > 0
  }
}