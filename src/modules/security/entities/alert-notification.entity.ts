import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm'
import { Alert } from './alert.entity'
import { AlertEscalation, NotificationChannel } from './alert-escalation.entity'

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  DELIVERED = 'delivered',
  READ = 'read'
}

@Entity('alert_notifications')
export class AlertNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  alertId: string

  @ManyToOne(() => Alert, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alertId' })
  alert: Alert

  @Column({ type: 'uuid', nullable: true })
  escalationId: string | null

  @ManyToOne(() => AlertEscalation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'escalationId' })
  escalation?: AlertEscalation

  @Column({
    type: 'enum',
    enum: NotificationChannel
  })
  channel: NotificationChannel

  @Column({ type: 'varchar', length: 500 })
  recipient: string

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING
  })
  status: NotificationStatus

  @Column({ type: 'varchar', length: 1000, nullable: true })
  messageId: string | null // External service message ID

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null

  @Column({ type: 'text', nullable: true })
  errorMessage: string

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>

  @Column({ type: 'int', nullable: true })
  retryCount: number

  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt: Date | null

  @CreateDateColumn()
  createdAt: Date

  // Computed properties
  get isSuccessful(): boolean {
    return [NotificationStatus.SENT, NotificationStatus.DELIVERED, NotificationStatus.READ].includes(this.status)
  }

  get isFailed(): boolean {
    return this.status === NotificationStatus.FAILED
  }

  get canRetry(): boolean {
    return this.status === NotificationStatus.FAILED && (this.retryCount || 0) < 3
  }

  get deliveryTimeMs(): number | null {
    if (!this.sentAt || !this.deliveredAt) return null
    return this.deliveredAt.getTime() - this.sentAt.getTime()
  }
}