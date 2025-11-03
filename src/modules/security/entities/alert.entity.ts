import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany
} from 'typeorm'
import { User } from '@modules/users/entities/user.entity'
import { AlertRule, AlertSeverity } from './alert-rule.entity'
import { AlertEscalation } from './alert-escalation.entity'
import { AuditLog } from '@modules/audit/entities/audit-log.entity'

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
  FALSE_POSITIVE = 'false_positive'
}

export enum AlertSource {
  AUDIT_LOG = 'audit_log',
  SYSTEM_METRIC = 'system_metric',
  MANUAL = 'manual',
  INTEGRATION = 'integration'
}

@Entity('alerts')
@Index(['status', 'severity', 'createdAt'])
@Index(['ruleId', 'createdAt'])
@Index(['assignedToId'])
@Index(['source'])
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  ruleId: string

  @ManyToOne(() => AlertRule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ruleId' })
  rule: AlertRule

  @Column({ type: 'varchar', length: 255 })
  title: string

  @Column({ type: 'text', nullable: true })
  description: string

  @Column({
    type: 'enum',
    enum: AlertSeverity
  })
  severity: AlertSeverity

  @Column({
    type: 'enum',
    enum: AlertStatus,
    default: AlertStatus.ACTIVE
  })
  status: AlertStatus

  @Column({
    type: 'enum',
    enum: AlertSource,
    default: AlertSource.AUDIT_LOG
  })
  source: AlertSource

  // Related entities
  @Column({ type: 'jsonb', nullable: true })
  relatedEntities: {
    auditLogIds?: string[]
    userIds?: string[]
    entityTypes?: string[]
    entityIds?: string[]
  }

  @OneToMany(() => AlertEscalation, escalation => escalation.alert, { cascade: true })
  escalations: AlertEscalation[]

  // Assignment
  @Column({ type: 'uuid', nullable: true })
  assignedToId: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo?: User

  // Timestamps
  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt: Date | null

  @Column({ type: 'uuid', nullable: true })
  acknowledgedById: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acknowledgedById' })
  acknowledgedBy?: User

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null

  @Column({ type: 'uuid', nullable: true })
  resolvedById: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy?: User

  @Column({ type: 'timestamp', nullable: true })
  lastEscalatedAt: Date | null

  // Metadata
  @Column({ type: 'jsonb', nullable: true })
  triggerData: Record<string, any>

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, any>

  @Column({ type: 'jsonb', nullable: true })
  tags: string[]

  @Column({ type: 'text', nullable: true })
  resolutionNotes: string

  // Performance tracking
  @Column({ type: 'int', default: 0 })
  escalationCount: number

  @Column({ type: 'int', nullable: true })
  timeToAcknowledgeMinutes: number | null

  @Column({ type: 'int', nullable: true })
  timeToResolveMinutes: number | null

  // Audit fields
  @Column({ type: 'uuid', nullable: true })
  createdById: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Computed properties
  get isActive(): boolean {
    return this.status === AlertStatus.ACTIVE
  }

  get isAcknowledged(): boolean {
    return [AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED, AlertStatus.FALSE_POSITIVE].includes(this.status)
  }

  get isResolved(): boolean {
    return [AlertStatus.RESOLVED, AlertStatus.FALSE_POSITIVE].includes(this.status)
  }

  get ageMinutes(): number {
    return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60))
  }

  get timeToAcknowledge(): number | null {
    if (!this.acknowledgedAt) return null
    return Math.floor((this.acknowledgedAt.getTime() - this.createdAt.getTime()) / (1000 * 60))
  }

  get timeToResolve(): number | null {
    if (!this.resolvedAt) return null
    return Math.floor((this.resolvedAt.getTime() - this.createdAt.getTime()) / (1000 * 60))
  }
}