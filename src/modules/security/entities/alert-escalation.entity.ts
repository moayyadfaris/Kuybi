import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm'
import { Alert } from './alert.entity'
import { User } from '@modules/users/entities/user.entity'

export enum EscalationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  ACKNOWLEDGED = 'acknowledged'
}

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
  WEBHOOK = 'webhook',
  SLACK = 'slack',
  PAGERDUTY = 'pagerduty',
  TEAMS = 'teams'
}

@Entity('alert_escalations')
export class AlertEscalation {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  alertId: string

  @ManyToOne(() => Alert, alert => alert.escalations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alertId' })
  alert: Alert

  @Column({ type: 'int', default: 1 })
  level: number

  @Column({
    type: 'enum',
    enum: NotificationChannel
  })
  channel: NotificationChannel

  @Column({ type: 'jsonb' })
  recipients: string[]

  @Column({
    type: 'enum',
    enum: EscalationStatus,
    default: EscalationStatus.PENDING
  })
  status: EscalationStatus

  @Column({ type: 'int', default: 0 }) // Minutes after alert creation
  delayMinutes: number

  @Column({ type: 'timestamp', nullable: true })
  scheduledFor: Date | null

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null

  @Column({ type: 'text', nullable: true })
  errorMessage: string

  @Column({ type: 'jsonb', nullable: true })
  channelConfig: Record<string, any>

  @Column({ type: 'uuid', nullable: true })
  acknowledgedById: string | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acknowledgedById' })
  acknowledgedBy?: User

  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt: Date | null

  @CreateDateColumn()
  createdAt: Date

  // Computed properties
  get isPending(): boolean {
    return this.status === EscalationStatus.PENDING
  }

  get isSent(): boolean {
    return this.status === EscalationStatus.SENT
  }

  get isAcknowledged(): boolean {
    return this.status === EscalationStatus.ACKNOWLEDGED
  }

  get shouldSend(): boolean {
    if (this.status !== EscalationStatus.PENDING) return false
    if (!this.scheduledFor) return false
    return new Date() >= this.scheduledFor
  }
}